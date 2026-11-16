import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { answerQuestionOp, askQuestion, deleteAnswer, deleteQuestion, listQuestions, voteQuestion } from "@/lib/server/ops/questions";
import { addDocumentationSource } from "@/lib/server/ops/documentation";
import { addDocument } from "@/lib/server/ops/documents";
import { overrideStubBrain } from "@/lib/server/ai/models";
import { qaStats } from "@/lib/metrics";
import { admin, seeded, sql } from "./support/db";
import { ctxAs, statusOf, type TestCtx } from "./support/ctx";
import { openSession } from "./support/interview";
import { REBUILD_GUIDE_MD, fileOf } from "./support/fixtures";

let ids: Awaited<ReturnType<typeof seeded>>;
let marcus: TestCtx;
beforeAll(async () => {
  ids = await seeded();
  marcus = await ctxAs("marcus");
});
afterEach(() => overrideStubBrain("librarian", null));

async function sessionWithGuide(title: string, audience: "learners" | "agents_only" = "learners") {
  const s = await openSession(title);
  await addDocument(marcus, { session_id: s.id, title: "Rebuild guide", audience, file: fileOf(REBUILD_GUIDE_MD, "rebuild-guide.md") });
  await marcus.runJobs();
  return s;
}

async function stateOf(id: string) {
  const [q] = await sql()`select state, author_id, sent_to_instructor_at from public.questions where id = ${id}`;
  return q;
}

describe("asking and voting", () => {
  it("a named question shows the name; an anonymous one stores no author and shows “Anonymous learner”", async () => {
    const s = await openSession("Ask");
    const aisha = await ctxAs("aisha");
    const named = await askQuestion(aisha, { session_id: s.id, text: "Where are the slides?", anonymous: false });
    const anon = await askQuestion(aisha, { session_id: s.id, text: "Is there a recording?", anonymous: true });
    expect((await stateOf(named.question.id)).author_id).not.toBeNull();
    expect((await stateOf(anon.question.id)).author_id).toBeNull();
    const [row] = await sql()`select author_id, author_name from public.questions where id = ${anon.question.id}`;
    expect(row).toEqual({ author_id: null, author_name: null });
    const list = await listQuestions(await ctxAs("ben"), { session_id: s.id });
    expect(list.questions.map((q) => q.author).sort()).toEqual(["Aisha Bello", "Anonymous learner"]);
  });

  it("counts a learner's vote once, returns 409 for a second, and orders by votes then time", async () => {
    const s = await openSession("Votes");
    const ben = await ctxAs("ben");
    const first = await askQuestion(ben, { session_id: s.id, text: "First question here?", anonymous: true });
    const second = await askQuestion(ben, { session_id: s.id, text: "Second question here?", anonymous: true });
    const third = await askQuestion(ben, { session_id: s.id, text: "Third question here?", anonymous: true });
    const chloe = await ctxAs("chloe");
    expect((await voteQuestion(chloe, { question_id: third.question.id })).votes).toBe(1);
    expect(await statusOf(voteQuestion(chloe, { question_id: third.question.id }))).toBe(409);
    await voteQuestion(await ctxAs("diego"), { question_id: third.question.id });
    await voteQuestion(await ctxAs("diego"), { question_id: second.question.id });
    const list = await listQuestions(chloe, { session_id: s.id });
    expect(list.questions.map((q) => [q.text, q.votes])).toEqual([
      ["Third question here?", 2],
      ["Second question here?", 1],
      ["First question here?", 0],
    ]);
    expect(list.questions[0].voted).toBe(true);
    void first;
  });
});

describe("the Librarian", () => {
  it("answers citing at least one chunk from the course, labelled as not reviewed", async () => {
    const s = await sessionWithGuide("Librarian answers");
    const { question } = await askQuestion(await ctxAs("aisha"), { session_id: s.id, text: "How do I find my project ID?", anonymous: true });
    await marcus.runJobs();
    expect((await stateOf(question.id)).state).toBe("ai_answered");
    const [answer] = (await listQuestions(marcus, { session_id: s.id })).questions[0].answers;
    expect(answer.kind).toBe("ai");
    expect(answer.text).toMatch(/address bar/);
    expect(answer.citations.length).toBeGreaterThan(0);
    const chunks = await sql()`select course_id from public.document_chunks where id = any(${answer.citations.map((c) => c.chunk_id)})`;
    expect(chunks.every((c) => c.course_id === ids.ime)).toBe(true);
    // Each citation shows its kind and links to its source: a document download, or the verified answer.
    for (const c of answer.citations) {
      expect(["session_document", "verified_answer", "documentation_page"]).toContain(c.kind);
      if (c.kind === "session_document") expect(c.url).toMatch(/^\/api\/documents\/.+\/download$/);
      if (c.kind === "verified_answer") expect(c.url).toMatch(/\/sessions\/\d+#q-/);
    }
  });

  it("rejects a citation of a chunk from another course", async () => {
    const [foreign] = await sql()`select id from public.document_chunks where course_id = ${ids.nwCourse} limit 1`;
    const foreignId = foreign?.id ?? (await (async () => {
      const owen = await ctxAs("owen");
      await addDocument(owen, { session_id: ids.nw1, title: "Northwind notes", audience: "learners", file: fileOf("# Notes\n\nFind your project ID in the address bar of the Northwind portal.", "nw.md") });
      await owen.runJobs();
      const [row] = await sql()`select id from public.document_chunks where course_id = ${ids.nwCourse} limit 1`;
      return row.id as string;
    })());
    overrideStubBrain("librarian", (call) =>
      call.toolResults.length
        ? { text: JSON.stringify({ answerable: true, answer: "It's in the address bar.", citations: [foreignId], sources_disagree: false }) }
        : { toolCalls: [{ name: "search_sources", input: { query: "project ID" } }] },
    );
    const s = await sessionWithGuide("Foreign citation");
    const { question } = await askQuestion(await ctxAs("aisha"), { session_id: s.id, text: "How do I find my project ID?", anonymous: true });
    await marcus.runJobs();
    expect((await stateOf(question.id)).state).toBe("needs_instructor");
    const answers = await sql()`select count(*)::int as n from public.answers where question_id = ${question.id}`;
    expect(answers[0].n).toBe(0);
  });

  it("with nothing relevant, moves the question to needs_instructor and notifies the instructor", async () => {
    const s = await sessionWithGuide("Nothing relevant");
    const { question } = await askQuestion(await ctxAs("ben"), { session_id: s.id, text: "Which train station is nearest the venue?", anonymous: false });
    const run = await marcus.runJobs();
    expect(run.failed).toBe(0);
    const q = await stateOf(question.id);
    expect(q.state).toBe("needs_instructor");
    expect(q.sent_to_instructor_at).not.toBeNull();
    // The search is still an agent call, so it is recorded even though no answer was drafted.
    const runs = await sql()`select agent, operation, learner_id from public.agent_runs where question_id = ${question.id}`;
    expect(runs.map((r) => [r.agent, r.operation])).toEqual([["librarian", "search_sources"]]);
    expect(marcus.outbox.filter((e) => e.text.includes("Which train station is nearest the venue?")).map((e) => e.to).sort()).toEqual([
      "dana.whitfield@streamspace.example",
      "marcus.lindqvist@streamspace.example",
    ]);
  });

  it("when two sources disagree, the answer says so and the instructor is notified", async () => {
    overrideStubBrain("librarian", (call) => {
      if (!call.toolResults.length) return { toolCalls: [{ name: "search_sources", input: { query: "share link expiry" } }] };
      const hits = call.toolResults.flatMap((r) => r.output as Array<{ id: string }>);
      return { text: JSON.stringify({ answerable: true, answer: "The guide says links expire after seven days, but the transcript says thirty. Check with your instructor.", citations: hits.slice(0, 2).map((h) => h.id), sources_disagree: true }) };
    });
    const s = await sessionWithGuide("Disagree");
    const { question } = await askQuestion(await ctxAs("chloe"), { session_id: s.id, text: "When do Link Generator share links expire?", anonymous: true });
    await marcus.runJobs();
    const q = await stateOf(question.id);
    expect(q.state).toBe("ai_answered");
    expect(q.sent_to_instructor_at).not.toBeNull();
    const [a] = await sql()`select text, sources_disagree from public.answers where question_id = ${question.id}`;
    expect(a.sources_disagree).toBe(true);
    expect(a.text).toMatch(/but/);
    expect(marcus.outbox.some((e) => /question needs your answer/i.test(e.subject))).toBe(true);
  });

  it("answers from what it found when the model would keep searching, because the last step offers no tools", async () => {
    // A real model searched six times and never answered, so the question went to the instructor.
    overrideStubBrain("librarian", (call) => {
      if (call.toolNames.length) return { toolCalls: [{ name: "search_sources", input: { query: `project ID ${call.toolResults.length}` } }] };
      const hits = call.toolResults.flatMap((r) => r.output as Array<{ id: string }>);
      return { text: JSON.stringify({ answerable: true, answer: "It's in the address bar.", citations: hits.slice(0, 1).map((h) => h.id), sources_disagree: false }) };
    });
    const s = await sessionWithGuide("Searching too long");
    const { question } = await askQuestion(await ctxAs("elena"), { session_id: s.id, text: "How do I find my project ID?", anonymous: true });
    await marcus.runJobs();
    expect((await stateOf(question.id)).state).toBe("ai_answered");
  });

  it("names an agents-only source without a link", async () => {
    const s = await openSession("Agents only source");
    const notes = "# Instructor notes\n\nThe hidden diagnostics panel opens with Ctrl+Shift+D in the workflow editor.";
    await addDocument(marcus, { session_id: s.id, title: "Instructor notes", audience: "agents_only", file: fileOf(notes, "instructor-notes.md") });
    await marcus.runJobs();
    const { question } = await askQuestion(await ctxAs("diego"), { session_id: s.id, text: "How do I open the hidden diagnostics panel?", anonymous: true });
    await marcus.runJobs();
    expect((await stateOf(question.id)).state).toBe("ai_answered");
    const [answer] = (await listQuestions(marcus, { session_id: s.id })).questions[0].answers;
    expect(answer.citations).toHaveLength(1);
    expect(answer.citations[0]).toMatchObject({ kind: "session_document", title: "Instructor notes", url: null });
  });
});

describe("instructor answers", () => {
  it("verifying changes the label to answered; editing, replacing and deleting work; a learner gets 403", async () => {
    const s = await sessionWithGuide("Verify");
    const aisha = await ctxAs("aisha");
    const { question } = await askQuestion(aisha, { session_id: s.id, text: "How do I find my project ID?", anonymous: true });
    await marcus.runJobs();
    const ai = (await listQuestions(marcus, { session_id: s.id })).questions[0].answers[0];
    expect(await statusOf(answerQuestionOp(aisha, { question_id: question.id, text: "", verifies_answer_id: ai.id }))).toBe(403);

    await answerQuestionOp(marcus, { question_id: question.id, text: "", verifies_answer_id: ai.id });
    let view = (await listQuestions(aisha, { session_id: s.id })).questions[0];
    expect(view.state).toBe("answered");
    expect(view.answers[0]).toMatchObject({ verified: true, edited: false });

    await answerQuestionOp(marcus, { question_id: question.id, text: "Open the project and copy the ID from the address bar.", verifies_answer_id: ai.id });
    view = (await listQuestions(aisha, { session_id: s.id })).questions[0];
    expect(view.answers[0]).toMatchObject({ text: "Open the project and copy the ID from the address bar.", edited: true });

    await answerQuestionOp(marcus, { question_id: question.id, text: "It's after /projects/ in the address bar.", verifies_answer_id: null });
    view = (await listQuestions(aisha, { session_id: s.id })).questions[0];
    expect(view.answers.map((a) => [a.kind, a.text])).toEqual([["instructor", "It's after /projects/ in the address bar."]]);

    await deleteQuestion(marcus, question.id);
    expect((await listQuestions(aisha, { session_id: s.id })).questions).toEqual([]);
  });

  it("a verified answer becomes a source for a later similar question, and stops being one when deleted", async () => {
    const s = await openSession("Verified source");
    const ben = await ctxAs("ben");
    const { question } = await askQuestion(ben, { session_id: s.id, text: "What is the wifi password in the training room?", anonymous: true });
    await marcus.runJobs();
    expect((await stateOf(question.id)).state).toBe("needs_instructor");
    const { answer_id } = await answerQuestionOp(marcus, { question_id: question.id, text: "The wifi password for the training room is on the whiteboard by the door.", verifies_answer_id: null });
    await marcus.runJobs();
    const [chunk] = await sql()`select source_kind from public.document_chunks where answer_id = ${answer_id}`;
    expect(chunk.source_kind).toBe("verified_answer");

    const later = await askQuestion(await ctxAs("chloe"), { session_id: s.id, text: "Where can I find the wifi password for the room?", anonymous: true });
    await marcus.runJobs();
    expect((await stateOf(later.question.id)).state).toBe("ai_answered");
    const [a] = await sql()`select citations from public.answers where question_id = ${later.question.id}`;
    expect((a.citations as Array<{ kind: string }>).map((c) => c.kind)).toContain("verified_answer");

    await deleteAnswer(marcus, answer_id);
    const gone = await sql()`select count(*)::int as n from public.document_chunks where answer_id = ${answer_id}`;
    expect(gone[0].n).toBe(0);
    const third = await askQuestion(await ctxAs("diego"), { session_id: s.id, text: "What's the wifi password for the training room?", anonymous: true });
    await marcus.runJobs();
    // The only other answer that mentions the wifi is the AI answer to the later question, which isn't verified.
    expect((await stateOf(third.question.id)).state).toBe("needs_instructor");
  });
});

describe("admins on the Q&A board", () => {
  it("an organization admin who isn't an instructor answers a question sent to the instructor, and removes a duplicate", async () => {
    const s = await openSession("Admin answers");
    const email = `qa.admin.${Date.now()}@staff.example`;
    const { data: user } = await admin().auth.admin.createUser({ email, email_confirm: true });
    await sql()`insert into public.memberships (organization_id, user_id, role, course_id, display_name, email) values (${ids.streamspace}, ${user.user!.id}, 'org_admin', null, 'QA Admin', ${email})`;
    const orgAdmin = await ctxAs({ email });
    const [asked, duplicate] = await sql()`insert into public.questions (organization_id, course_id, session_id, text, state, origin)
      values (${ids.streamspace}, ${ids.ime}, ${s.id}, 'Is there a recording of the session?', 'needs_instructor', 'interview'),
             (${ids.streamspace}, ${ids.ime}, ${s.id}, 'Is there a recording of the session?', 'needs_instructor', 'interview') returning id`;
    await answerQuestionOp(orgAdmin, { question_id: asked.id as string, text: "Yes: it's on the session page under Materials.", verifies_answer_id: null });
    const [row] = await sql()`select state from public.questions where id = ${asked.id}`;
    expect(row.state).toBe("answered");
    await deleteQuestion(orgAdmin, duplicate.id as string);
    expect(await sql()`select id from public.questions where id = ${duplicate.id}`).toHaveLength(0);
    // A learner, and another organization's admin, can't.
    expect([403, 404]).toContain(await statusOf(answerQuestionOp(await ctxAs("ben"), { question_id: asked.id as string, text: "Me too", verifies_answer_id: null })));
    expect([403, 404]).toContain(await statusOf(deleteQuestion(await ctxAs("owen"), asked.id as string)));
  });
});

describe("documentation sites", () => {
  let server: Server;
  let base: string;
  const pages: Record<string, string> = {};
  const scripts: Record<string, string> = {};
  const page = (title: string, body: string, links: string[] = []) =>
    `<html><head><title>${title}</title></head><body><nav><a href="/docs/">Home</a></nav><main><h1>${title}</h1><p>${body}</p>${links.map((l) => `<a href="${l}">${l}</a>`).join(" ")}</main></body></html>`;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const path = (req.url ?? "/").split("?")[0];
      if (path === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        return res.end("User-agent: *\nDisallow: /docs/private\n");
      }
      if (scripts[path]) {
        res.writeHead(200, { "content-type": "text/javascript" });
        return res.end(scripts[path]);
      }
      const html = pages[path];
      if (!html) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    Object.assign(pages, {
      "/docs/": page("Northwind portal docs", "Welcome to the documentation for the Northwind customer portal and its account tools.", ["/docs/accounts", "/docs/milestones", "/docs/billing", "/docs/support", "/docs/private", "https://other.example/elsewhere", "/blog/news"]),
      "/docs/accounts": page("Setting up accounts", "Create the customer account from the Accounts screen and send the welcome email straight away.", ["/docs/milestones"]),
      "/docs/milestones": page("Agreeing milestones", "Agree the first milestone with the customer during the welcome call and record it in the plan.", ["/docs/accounts"]),
      "/docs/billing": page("Billing questions", "Invoices are issued monthly on the first working day and can be downloaded from the Billing screen."),
      "/docs/support": page("Getting support", "Raise a support ticket from the Help menu; urgent issues go to the duty phone line."),
      "/docs/private": page("Internal only", "Staff rota and internal notes that robots must not read."),
      "/blog/news": page("News", "Company news is outside the documentation."),
    });
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  async function pagesStored(sourceId: string) {
    const rows = await sql()`select page_url, max(page_hash) as hash from public.document_chunks where documentation_source_id = ${sourceId} group by page_url order by page_url`;
    return rows.map((r) => [r.page_url.replace(base, ""), r.hash]);
  }

  it("stores all five pages, follows robots rules, and doesn't follow links to another host", async () => {
    const owen = await ctxAs("owen");
    expect(await statusOf(addDocumentationSource(await ctxAs("isla"), { organization_id: ids.northwind, url: `${base}/docs/` }))).toBe(403);
    const { source } = await addDocumentationSource(owen, { organization_id: ids.northwind, url: `${base}/docs/` });
    await owen.runJobs();
    const stored = await pagesStored(source.id);
    expect(stored.map((p) => p[0])).toEqual(["/docs/", "/docs/accounts", "/docs/billing", "/docs/milestones", "/docs/support"]);
    const [row] = await sql()`select status, page_count, next_read_at from public.documentation_sources where id = ${source.id}`;
    expect(row).toMatchObject({ status: "ready", page_count: 5 });
    expect(row.next_read_at).not.toBeNull();

    // Second read: one page changed, one removed.
    const before = new Map(stored as Array<[string, string]>);
    pages["/docs/billing"] = page("Billing questions", "Invoices are now issued every two weeks and can be downloaded from the Billing screen.");
    delete pages["/docs/support"];
    pages["/docs/"] = pages["/docs/"].replace('<a href="/docs/support">/docs/support</a>', "");
    await addDocumentationSource(owen, { organization_id: ids.northwind, url: `${base}/docs/` });
    await owen.runJobs();
    const after = new Map((await pagesStored(source.id)) as Array<[string, string]>);
    expect([...after.keys()]).toEqual(["/docs/", "/docs/accounts", "/docs/billing", "/docs/milestones"]);
    expect(after.get("/docs/billing")).not.toBe(before.get("/docs/billing"));
    expect(after.get("/docs/accounts")).toBe(before.get("/docs/accounts"));
    const text = await sql()`select content from public.document_chunks where documentation_source_id = ${source.id} and page_url like '%/docs/billing'`;
    expect(text.map((t) => t.content).join(" ")).toContain("every two weeks");
  });

  it("stores a page whose title and text hold NUL characters, which Postgres text can't", async () => {
    // docs.streamspace.ai has such a page: the whole read failed with 22P05 until they were removed.
    pages["/stray/"] = page("Export\u0000 notes", "Exported text\u0000 with a stray NUL character, as PDF extraction and some sites produce.");
    const owen = await ctxAs("owen");
    const { source } = await addDocumentationSource(owen, { organization_id: ids.northwind, url: `${base}/stray/` });
    await owen.runJobs();
    const [row] = await sql()`select status, page_count from public.documentation_sources where id = ${source.id}`;
    expect(row).toMatchObject({ status: "ready", page_count: 1 });
    const [chunk] = await sql()`select title, content from public.document_chunks where documentation_source_id = ${source.id}`;
    expect(chunk).toMatchObject({ title: "Export notes — Export notes", content: expect.stringContaining("Exported text with a stray NUL") });
  });

  it("reads a JavaScript documentation app from the Markdown carried in its script", async () => {
    // Every address on the site returns the same empty page; the text is in the script.
    const shell = '<html><head><title>Docs</title><script type="module" src="/spa/assets/index.js"></script></head><body><div id=root></div></body></html>';
    pages["/spa/"] = shell;
    scripts["/spa/assets/index.js"] = [
      'const BRAND_NAME="Northwind",y=2;',
      "var a=`---\\ntitle: Portal basics\\n---\\nThe {{BRAND_NAME}} portal keeps every customer account in one place, with its milestones and invoices.`,",
      "b=`---\\ntitle: Exports\\n---\\nExport a customer's invoices from the Billing screen as a CSV file, one row per invoice.`;",
      'const modules=Object.assign({"/content/spa/index.md":a,"/content/spa/billing/exports.md":b});',
    ].join("\n");
    const owen = await ctxAs("owen");
    const { source } = await addDocumentationSource(owen, { organization_id: ids.northwind, url: `${base}/spa/` });
    await owen.runJobs();
    const [row] = await sql()`select status, page_count, error from public.documentation_sources where id = ${source.id}`;
    expect(row).toMatchObject({ status: "ready", page_count: 2 });
    expect((await pagesStored(source.id)).map((p) => p[0])).toEqual(["/spa", "/spa/billing/exports"]);
    const [chunk] = await sql()`select content from public.document_chunks where documentation_source_id = ${source.id} and page_url like '%/spa'`;
    expect(chunk.content).toContain("The Northwind portal keeps every customer account");
  });

  it("says why a site couldn't be read instead of calling it ready, and keeps pages read before", async () => {
    const owen = await ctxAs("owen");
    const status = async (id: string) => (await sql()`select status, error, page_count from public.documentation_sources where id = ${id}`)[0];

    // An address with no page.
    const missing = await addDocumentationSource(owen, { organization_id: ids.northwind, url: `${base}/no-such-docs/` });
    await owen.runJobs();
    expect(await status(missing.source.id)).toMatchObject({ status: "failed", error: expect.stringContaining("HTTP 404") });

    // A page built in the browser: almost no text and no links.
    pages["/app/"] = "<html><head><title>Docs</title></head><body><div id=root></div><script src=/app.js></script></body></html>";
    const empty = await addDocumentationSource(owen, { organization_id: ids.northwind, url: `${base}/app/` });
    await owen.runJobs();
    expect(await status(empty.source.id)).toMatchObject({ status: "failed", error: expect.stringContaining("JavaScript") });

    // A host that can't be reached.
    const nowhere = await addDocumentationSource(owen, { organization_id: ids.northwind, url: "http://127.0.0.1:9/docs/" });
    await owen.runJobs();
    expect(await status(nowhere.source.id)).toMatchObject({ status: "failed", error: expect.stringContaining("couldn't be reached") });

    // A site read before that is down on the next read keeps its pages.
    pages["/kept/"] = page("Kept docs", "These pages were read once and must survive a failed re-read of the whole site.");
    const kept = await addDocumentationSource(owen, { organization_id: ids.northwind, url: `${base}/kept/` });
    await owen.runJobs();
    expect(await status(kept.source.id)).toMatchObject({ status: "ready", page_count: 1 });
    delete pages["/kept/"];
    await addDocumentationSource(owen, { organization_id: ids.northwind, url: `${base}/kept/` });
    await owen.runJobs();
    expect(await status(kept.source.id)).toMatchObject({ status: "failed", page_count: 1 });
    expect(await pagesStored(kept.source.id)).toHaveLength(1);
  });
});

describe("Q&A figures", () => {
  it("count open against answered, the median time to an answer, and those sent to the instructor", () => {
    const t = (m: number) => new Date(Date.UTC(2026, 10, 14, 9, m)).toISOString();
    expect(
      qaStats([
        { state: "ai_answered", created_at: t(0), first_answered_at: t(1), sent_to_instructor_at: null },
        { state: "answered", created_at: t(0), first_answered_at: t(30), sent_to_instructor_at: t(0) },
        { state: "answered", created_at: t(0), first_answered_at: t(5), sent_to_instructor_at: null },
        { state: "needs_instructor", created_at: t(0), first_answered_at: null, sent_to_instructor_at: t(0) },
        { state: "open", created_at: t(0), first_answered_at: null, sent_to_instructor_at: null },
      ]),
    ).toEqual({ open: 2, answered: 3, median_minutes: 5, sent_to_instructor: 2 });
  });
});
