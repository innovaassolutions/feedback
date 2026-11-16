import { beforeAll, describe, expect, it } from "vitest";
import { addDocument, documentDownloadUrl, removeDocument } from "@/lib/server/ops/documents";
import { approveBrief, createSession, getSession, setSessionState } from "@/lib/server/ops/sessions";
import { inviteLearners } from "@/lib/server/ops/roster";
import { seeded, sql } from "./support/db";
import { ctxAs, statusOf, type TestCtx } from "./support/ctx";
import { REBUILD_GUIDE_MD, TRANSCRIPT_VTT, fileOf, makeDocx, makePdf } from "./support/fixtures";

let ids: Awaited<ReturnType<typeof seeded>>;
let marcus: TestCtx;

beforeAll(async () => {
  ids = await seeded();
  marcus = await ctxAs("marcus");
});

async function newSession(title: string) {
  const { session } = await createSession(marcus, { course_id: ids.ime, title, date: "2026-12-04", objectives: "Practise the steps." });
  return session;
}

describe("sessions", () => {
  it("an instructor creates a session and moves it Draft → Upcoming → Feedback open → Closed, and not back", async () => {
    const s = await newSession("Session state walk");
    expect(s.state).toBe("draft");
    expect(s.number).toBeGreaterThanOrEqual(4);
    for (const state of ["scheduled", "open", "closed"] as const) {
      const { session } = await setSessionState(marcus, { session_id: s.id, state });
      expect(session.state).toBe(state);
    }
    expect(await statusOf(setSessionState(marcus, { session_id: s.id, state: "open" }))).toBe(409);
  });

  it("refuses to skip a state", async () => {
    const s = await newSession("No skipping");
    expect(await statusOf(setSessionState(marcus, { session_id: s.id, state: "open" }))).toBe(409);
  });

  it("opening a session sets its feedback window", async () => {
    const s = await newSession("Window");
    await setSessionState(marcus, { session_id: s.id, state: "scheduled" });
    const { session } = await setSessionState(marcus, { session_id: s.id, state: "open" });
    expect(session.opened_at).toBeTruthy();
    expect(new Date(session.closes_at!).getTime() - new Date(session.opened_at!).getTime()).toBe(7 * 86_400_000);
  });

  it("a learner can't create a session (403), and another organization's course is 404", async () => {
    const aisha = await ctxAs("aisha");
    expect(await statusOf(createSession(aisha, { course_id: ids.ime, title: "x", date: "2026-12-01", objectives: "" }))).toBe(403);
    const owen = await ctxAs("owen");
    expect(await statusOf(createSession(owen, { course_id: ids.ime, title: "x", date: "2026-12-01", objectives: "" }))).toBe(404);
    expect(await statusOf(getSession(owen, { session_id: ids.s1 }))).toBe(404);
  });
});

describe("documents", () => {
  let session: { id: string };
  beforeAll(async () => {
    session = await newSession("Documents");
  });

  it("accepts a PDF, a DOCX, a Markdown file and a VTT transcript", async () => {
    const files = [
      fileOf(await makePdf(["Rebuild guide", "Get Document Data pulls fields from the file.", "Core Agent uses them."]), "guide.pdf", "application/pdf"),
      fileOf(await makeDocx(["Session notes", "Link Generator creates share links for results."]), "notes.docx"),
      fileOf(REBUILD_GUIDE_MD, "rebuild-guide.md", "text/markdown"),
      fileOf(TRANSCRIPT_VTT, "transcript.vtt", "text/vtt"),
    ];
    for (const file of files) {
      const { document } = await addDocument(marcus, { session_id: session.id, title: file.name, audience: "learners", file });
      expect(document.status).toBe("processing");
    }
    await marcus.runJobs();
    const docs = await sql()`select file_name, status, chunk_count from public.documents where session_id = ${session.id} order by file_name`;
    expect(docs.map((d) => [d.file_name, d.status])).toEqual([
      ["guide.pdf", "ready"],
      ["notes.docx", "ready"],
      ["rebuild-guide.md", "ready"],
      ["transcript.vtt", "ready"],
    ]);
    for (const d of docs) expect(d.chunk_count).toBeGreaterThan(0);
  });

  it("rejects an .exe and a 26 MB file with 422 and stores nothing", async () => {
    const before = await sql()`select count(*)::int as n from public.documents where session_id = ${session.id}`;
    const objectsBefore = await sql()`select count(*)::int as n from storage.objects where bucket_id = 'documents' and name like ${`%/${session.id}/%`}`;
    const exe = fileOf(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]), "setup.exe");
    expect(await statusOf(addDocument(marcus, { session_id: session.id, title: "exe", audience: "learners", file: exe }))).toBe(422);
    const renamed = fileOf(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]), "setup.pdf");
    expect(await statusOf(addDocument(marcus, { session_id: session.id, title: "renamed", audience: "learners", file: renamed }))).toBe(422);
    const big = fileOf(new Uint8Array(26 * 1024 * 1024).fill(65), "big.txt", "text/plain");
    expect(await statusOf(addDocument(marcus, { session_id: session.id, title: "big", audience: "learners", file: big }))).toBe(422);
    const after = await sql()`select count(*)::int as n from public.documents where session_id = ${session.id}`;
    const objectsAfter = await sql()`select count(*)::int as n from storage.objects where bucket_id = 'documents' and name like ${`%/${session.id}/%`}`;
    expect(after[0].n).toBe(before[0].n);
    expect(objectsAfter[0].n).toBe(objectsBefore[0].n);
  });

  it("stores chunks with embeddings and moves a document processing → ready", async () => {
    const s = await newSession("Reading");
    const { document } = await addDocument(marcus, { session_id: s.id, title: "Guide", audience: "learners", file: fileOf(REBUILD_GUIDE_MD, "g.md") });
    const [row] = await sql()`select status from public.documents where id = ${document.id}`;
    expect(row.status).toBe("processing");
    await marcus.runJobs();
    const [done] = await sql()`select status, chunk_count from public.documents where id = ${document.id}`;
    expect(done.status).toBe("ready");
    const chunks = await sql()`select title, vector_dims(embedding) as dims, source_kind from public.document_chunks where document_id = ${document.id}`;
    expect(chunks.length).toBe(done.chunk_count);
    expect(chunks.every((c) => c.dims === 1536 && c.source_kind === "session_document")).toBe(true);
    expect(chunks.some((c) => String(c.title).includes("Link Generator"))).toBe(true);
  });

  it("a corrupt file ends as failed, with a message for the administration page", async () => {
    const s = await newSession("Corrupt");
    const corrupt = fileOf(new TextEncoder().encode("%PDF-1.7\nthis is not really a pdf \u0001\u0002"), "broken.pdf");
    const { document } = await addDocument(marcus, { session_id: s.id, title: "Broken", audience: "learners", file: corrupt });
    await marcus.runJobs();
    const [row] = await sql()`select status, error from public.documents where id = ${document.id}`;
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/couldn't read this PDF/i);
  });

  it("removing a document removes its chunks and file", async () => {
    const s = await newSession("Remove");
    const { document } = await addDocument(marcus, { session_id: s.id, title: "Temp", audience: "learners", file: fileOf(REBUILD_GUIDE_MD, "t.md") });
    await marcus.runJobs();
    await removeDocument(marcus, { document_id: document.id });
    const chunks = await sql()`select count(*)::int as n from public.document_chunks where document_id = ${document.id}`;
    const objects = await sql()`select count(*)::int as n from storage.objects where name like ${`%/${document.id}/%`}`;
    expect(chunks[0].n).toBe(0);
    expect(objects[0].n).toBe(0);
  });
});

describe("what learners see", () => {
  it("lists learner documents with a signed URL, hides agents-only documents and 404s their URL", async () => {
    const s = await newSession("Learner view");
    await setSessionState(marcus, { session_id: s.id, state: "scheduled" });
    const { document: shared } = await addDocument(marcus, { session_id: s.id, title: "Handout", audience: "learners", file: fileOf(REBUILD_GUIDE_MD, "handout.md") });
    const { document: hidden } = await addDocument(marcus, { session_id: s.id, title: "Answer key", audience: "agents_only", file: fileOf(REBUILD_GUIDE_MD, "answers.md") });
    const aisha = await ctxAs("aisha");
    const view = await getSession(aisha, { session_id: s.id });
    expect(view.documents.map((d) => d.title)).toEqual(["Handout"]);
    const url = await documentDownloadUrl(aisha, shared.id);
    expect(url).toMatch(/\/storage\/v1\/object\/sign\/documents\//);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Rebuild guide");
    expect(await statusOf(documentDownloadUrl(aisha, hidden.id))).toBe(404);
    const priya = await ctxAs("priya");
    expect(await statusOf(documentDownloadUrl(priya, hidden.id))).toBe(404);
  });
});

describe("the session brief", () => {
  it("is drafted with objectives, topics and known issues, and isn't returned until approved", async () => {
    const s = await newSession("Brief");
    await addDocument(marcus, { session_id: s.id, title: "Rebuild guide", audience: "agents_only", file: fileOf(REBUILD_GUIDE_MD, "rebuild.md") });
    await marcus.runJobs();
    const draft = await getSession(marcus, { session_id: s.id });
    expect(draft.session.brief).toBeNull();
    const brief = draft.brief_draft as { objectives: string[]; topics: string[]; known_issues: string[] };
    expect(brief.objectives.length).toBeGreaterThan(0);
    expect(brief.topics).toEqual(expect.arrayContaining(["Get Document Data", "Core Agent", "Link Generator"]));
    expect(brief.known_issues.join(" ")).toMatch(/couldn't sign in/);

    // The Interviewer reads the session through get_session as a learner would: still no brief.
    const learnerView = await getSession(await ctxAs("aisha"), { session_id: ids.s1 });
    expect(learnerView).not.toHaveProperty("brief_draft");

    await approveBrief(marcus, { session_id: s.id, objectives: brief.objectives, topics: brief.topics, known_issues: brief.known_issues });
    const approved = await getSession(marcus, { session_id: s.id });
    expect(approved.session.brief).toEqual({ objectives: brief.objectives, topics: brief.topics, known_issues: brief.known_issues });
  });
});

describe("the roster", () => {
  it("enrolls three pasted addresses, sends three sign-in emails, and skips a duplicate", async () => {
    const stamp = Date.now();
    const emails = [`river.${stamp}@invite.example`, `sasha.${stamp}@invite.example`, `toby.${stamp}@invite.example`];
    const since = new Date();
    const report = await inviteLearners(marcus, { course_id: ids.ime, emails: [`${emails.join("\n")}\n${emails[0]}`] });
    expect(report.enrolled.map((e) => e.email)).toEqual(emails);
    expect(report.skipped).toEqual([{ email: emails[0], reason: "listed twice" }]);
    const rows = await sql()`select email from public.enrollments where course_id = ${ids.ime} and email = any(${emails})`;
    expect(rows.length).toBe(3);

    // Auth sends one email per address per second on the test stack (a minute in production).
    await new Promise((r) => setTimeout(r, 1500));
    const again = await inviteLearners(marcus, { course_id: ids.ime, emails: [emails[1]] });
    // Not signed in yet, so inviting again sends the invitation again rather than skipping.
    expect(again.enrolled).toEqual([]);
    expect(again.resent).toEqual([emails[1]]);
    expect(again.skipped).toEqual([]);
    expect(again.unsent).toEqual([]);
    expect(report.unsent).toEqual([]);

    for (const email of emails) {
      let found = false;
      for (let i = 0; i < 20 && !found; i++) {
        const res = await fetch(`${process.env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
        const body = (await res.json()) as { messages: Array<{ Created: string; Subject: string }> };
        found = body.messages.some((m) => new Date(m.Created) >= new Date(since.getTime() - 2000));
        if (!found) await new Promise((r) => setTimeout(r, 250));
      }
      expect(found, `no sign-in email for ${email}`).toBe(true);
    }
  });

  it("only course managers can invite", async () => {
    const aisha = await ctxAs("aisha");
    expect(await statusOf(inviteLearners(aisha, { course_id: ids.ime, emails: ["new@invite.example"] }))).toBe(403);
  });
});
