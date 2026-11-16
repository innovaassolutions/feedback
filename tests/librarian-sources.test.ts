import { beforeAll, describe, expect, it } from "vitest";
import { isTranscript, pickShares, sourceLabel, type SourceGroup, type SourceHit } from "@/agents/librarian/tools";
import { detectDocumentKind, documentStoragePath } from "@/lib/files";
import { extractText } from "@/lib/server/librarian/extract";
import { registerDocument } from "@/lib/server/ops/documents";
import { admin, seeded, sql } from "./support/db";
import { ctxAs, statusOf, type TestCtx } from "./support/ctx";

const KIND: Record<SourceGroup, SourceHit["kind"]> = {
  this_session: "session_document",
  other_session: "session_document",
  documentation: "documentation_page",
  verified_answer: "verified_answer",
};

function hit(id: string, group: SourceGroup, similarity: number, extra: Partial<SourceHit> = {}): SourceHit {
  return {
    id,
    kind: KIND[group],
    group,
    title: id,
    content: "",
    document_id: null,
    page_url: null,
    answer_id: null,
    session_id: null,
    session_number: null,
    session_title: null,
    transcript: false,
    similarity,
    ...extra,
  };
}

/** A 1536-dimension embedding with its first two values set. */
const vector = (a: number, b: number) => `[${[a, b, ...Array(1534).fill(0)].join(",")}]`;

async function newSession(courseId: string, organizationId: string, title: string) {
  const number = 50000 + Math.floor(Math.random() * 9000);
  const { data, error } = await admin()
    .from("sessions")
    .insert({ organization_id: organizationId, course_id: courseId, number, title, date: "2026-12-10", state: "open", opened_at: new Date().toISOString() })
    .select("id, number")
    .single();
  if (error) throw error;
  return data;
}

describe("the Librarian's search", () => {
  it("gives every kind of source its share, so a long transcript can't crowd out the documentation", () => {
    const hits = [
      ...Array.from({ length: 8 }, (_, i) => hit(`t${i}`, "this_session", 0.9 - i * 0.01)),
      hit("d1", "documentation", 0.5),
      hit("d2", "documentation", 0.49),
      hit("o1", "other_session", 0.6),
      hit("v1", "verified_answer", 0.55),
    ];
    const picked = pickShares(hits, "everything");
    expect(picked.filter((h) => h.group === "this_session")).toHaveLength(4);
    expect(picked.map((h) => h.id)).toEqual(expect.arrayContaining(["d1", "d2", "o1", "v1"]));
    // Best first, whatever the group.
    expect(picked.map((h) => h.similarity)).toEqual([...picked.map((h) => h.similarity)].sort((a, b) => b - a));
    expect(pickShares(hits, "documentation").map((h) => h.id)).toEqual(["d1", "d2"]);
    expect(pickShares(hits, "this_session")).toHaveLength(6);
  });

  it("tells the model where each passage comes from", () => {
    expect(sourceLabel(hit("a", "this_session", 1, { transcript: true, session_number: 3, session_title: "Automations", title: "Recording" }))).toBe(
      "This session's transcript (Session 3: Automations): Recording",
    );
    expect(sourceLabel(hit("b", "other_session", 1, { session_number: 2, title: "Slides" }))).toBe("Session 2's document: Slides");
    expect(sourceLabel(hit("c", "documentation", 1, { title: "Retries", page_url: "https://docs.example/retries" }))).toBe(
      "Product documentation: Retries (https://docs.example/retries)",
    );
    expect(isTranscript("call.vtt", "text/vtt", "Call")).toBe(true);
    expect(isTranscript("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Session 3 transcript")).toBe(true);
    expect(isTranscript("slides.pdf", "application/pdf", "Slides")).toBe(false);
  });

  it("returns each group's nearest passages separately, with the session they came from", async () => {
    const ids = await seeded();
    const asked = await newSession(ids.ime, ids.streamspace, "Grouped search: asked here");
    const earlier = await newSession(ids.ime, ids.streamspace, "Grouped search: earlier");
    const db = sql();
    const doc = async (sessionId: string, fileName: string, mime: string) => {
      const [row] = await db`insert into public.documents (organization_id, course_id, session_id, title, audience, storage_path, file_name, mime_type, size_bytes, status)
        values (${ids.streamspace}, ${ids.ime}, ${sessionId}, ${fileName}, 'agents_only', ${`test/${crypto.randomUUID()}/${fileName}`}, ${fileName}, ${mime}, 10, 'ready') returning id`;
      return row.id as string;
    };
    const transcript = await doc(asked.id, "recording.vtt", "text/vtt");
    const slides = await doc(earlier.id, "slides.pdf", "application/pdf");
    const [source] = await db`insert into public.documentation_sources (organization_id, url, status) values (${ids.streamspace}, ${`https://docs.grouped.example/${crypto.randomUUID()}`}, 'ready') returning id`;
    const chunk = async (values: Record<string, unknown>, embedding: string) => {
      const [row] = await db`insert into public.document_chunks ${db({ organization_id: ids.streamspace, ...values })} returning id`;
      await db`update public.document_chunks set embedding = ${embedding}::extensions.vector where id = ${row.id}`;
      return row.id as string;
    };
    // Three transcript passages close to the query, one earlier-session passage, two documentation pages further away.
    const near = [];
    for (const b of [0.1, 0.2, 0.3]) {
      near.push(await chunk({ course_id: ids.ime, session_id: asked.id, source_kind: "session_document", document_id: transcript, title: "Recording", content: `t ${b}`, embedding: vector(1, b) }, vector(1, b)));
    }
    const other = await chunk({ course_id: ids.ime, session_id: earlier.id, source_kind: "session_document", document_id: slides, title: "Slides", content: "o", embedding: vector(1, 0.05) }, vector(1, 0.05));
    const docs = [];
    for (const b of [0.6, 0.7]) {
      docs.push(
        await chunk(
          { course_id: null, session_id: null, source_kind: "documentation_page", documentation_source_id: source.id, page_url: `https://docs.grouped.example/p${b}`, title: "Docs", content: `d ${b}`, embedding: vector(0.8, b) },
          vector(0.8, b),
        ),
      );
    }

    const { data, error } = await admin().rpc("match_chunks_grouped", { p_course_id: ids.ime, p_session_id: asked.id, p_embedding: vector(1, 0), p_per_group: 2 });
    expect(error).toBeNull();
    const rows = data ?? [];
    const thisSession = rows.filter((r) => r.source_group === "this_session");
    expect(thisSession.map((r) => r.id)).toEqual([near[0], near[1]]);
    expect(thisSession[0]).toMatchObject({ session_number: asked.number, session_title: "Grouped search: asked here", mime_type: "text/vtt", file_name: "recording.vtt" });
    expect(rows.find((r) => r.id === other)).toMatchObject({ source_group: "other_session", session_number: earlier.number });
    // The documentation is returned although every transcript passage is nearer.
    expect(rows.filter((r) => r.source_group === "documentation").map((r) => r.id)).toEqual(expect.arrayContaining(docs));
    expect(rows.filter((r) => r.source_group === "documentation").length).toBeLessThanOrEqual(2);
  });
});

describe("transcripts", () => {
  const SRT = "1\n00:00:01,000 --> 00:00:04,000\nInstructor: Open Automations.\n\n2\n00:00:04,500 --> 00:00:08,000\nThen choose New automation.\n";

  it("accepts SRT subtitle files and reads them without numbers or timings", async () => {
    const bytes = new TextEncoder().encode(SRT);
    expect(detectDocumentKind("session.srt", bytes)).toBe("srt");
    expect(detectDocumentKind("session.srt", new TextEncoder().encode("Just some notes, no timings at all."))).toBeNull();
    expect(await extractText("srt", bytes)).toBe("Instructor: Open Automations.\nThen choose New automation.");
  });
});

describe("documents uploaded straight to storage", () => {
  let ids: Awaited<ReturnType<typeof seeded>>;
  let marcus: TestCtx;
  let session: { id: string; number: number };
  beforeAll(async () => {
    ids = await seeded();
    marcus = await ctxAs("marcus");
    session = await newSession(ids.ime, ids.streamspace, "Direct uploads");
  });
  const pathFor = (documentId: string, fileName: string) =>
    documentStoragePath({ organizationId: ids.streamspace, courseId: ids.ime, sessionId: session.id }, documentId, fileName);

  it("records a file the instructor stored, checked from its bytes, and queues it for reading", async () => {
    const documentId = crypto.randomUUID();
    const stored = await marcus.db.storage.from("documents").upload(pathFor(documentId, "Session notes.md"), new TextEncoder().encode("# Notes\n\nWe built the invoice automation."), { contentType: "text/markdown" });
    expect(stored.error).toBeNull();
    const { document } = await registerDocument(marcus, { session_id: session.id, document_id: documentId, file_name: "Session notes.md", title: "Session notes", audience: "agents_only" });
    expect(document).toMatchObject({ id: documentId, status: "processing", file_name: "Session-notes.md" });
    const [job] = await sql()`select kind from public.jobs where payload ->> 'document_id' = ${documentId}`;
    expect(job.kind).toBe("read_document");
    // The same upload can't be recorded twice.
    expect(await statusOf(registerDocument(marcus, { session_id: session.id, document_id: documentId, file_name: "Session notes.md", title: "Again", audience: "agents_only" }))).toBe(409);
  });

  it("deletes a stored file that isn't what its name says, and refuses one that was never stored", async () => {
    const documentId = crypto.randomUUID();
    await marcus.db.storage.from("documents").upload(pathFor(documentId, "slides.pdf"), new TextEncoder().encode("not really a PDF"), { contentType: "application/pdf" });
    expect(await statusOf(registerDocument(marcus, { session_id: session.id, document_id: documentId, file_name: "slides.pdf", title: "Slides", audience: "learners" }))).toBe(422);
    const { error } = await admin().storage.from("documents").download(pathFor(documentId, "slides.pdf"));
    expect(error).not.toBeNull();
    expect(await statusOf(registerDocument(marcus, { session_id: session.id, document_id: crypto.randomUUID(), file_name: "missing.md", title: "Missing", audience: "learners" }))).toBe(404);
  });

  it("lets only the course's managers store or record documents", async () => {
    const ben = await ctxAs("ben");
    const owen = await ctxAs("owen");
    const documentId = crypto.randomUUID();
    const stored = await ben.db.storage.from("documents").upload(pathFor(documentId, "mine.md"), new TextEncoder().encode("# A learner's file"), { contentType: "text/markdown" });
    expect(stored.error).not.toBeNull();
    expect([403, 404]).toContain(await statusOf(registerDocument(ben, { session_id: session.id, document_id: documentId, file_name: "mine.md", title: "Mine", audience: "learners" })));
    expect(await statusOf(registerDocument(owen, { session_id: session.id, document_id: documentId, file_name: "mine.md", title: "Mine", audience: "learners" }))).toBe(404);
  });
});
