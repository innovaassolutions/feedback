import { beforeAll, describe, expect, it } from "vitest";
import { getQuality, deleteMyData, markInsightAccuracy } from "@/lib/server/ops/quality";
import { listInterviews, getFollowUpResults } from "@/lib/server/ops/results";
import { saveRating, sendTurn, startInterview, submitInterview } from "@/lib/server/ops/interviews";
import { askQuestion } from "@/lib/server/ops/questions";
import { checkAlerts, scoreInterview } from "@/lib/server/quality/jobs";
import { applyRetention, sendReminders } from "@/lib/server/schedule";
import { seedDemoInterviews } from "@/lib/server/demo";
import { STREAMSPACE_LEARNERS } from "@/lib/server/seed";
import { loadAgentFile } from "@/lib/server/ai/agent-file";
import { languageModel, overrideStubBrain } from "@/lib/server/ai/models";
import { judgeTranscript } from "@/lib/server/quality/rubric";
import type { Email } from "@/lib/server/email";
import { admin, seeded, sql, userId } from "./support/db";
import { ctxAs, statusOf } from "./support/ctx";
import { interviewToReadBack, openSession, submit } from "./support/interview";
import { addDocument } from "@/lib/server/ops/documents";
import { REBUILD_GUIDE_MD, fileOf } from "./support/fixtures";

let ids: Awaited<ReturnType<typeof seeded>>;
beforeAll(async () => {
  ids = await seeded();
  // Some Librarian work of this file's own, so its runs are there whatever order files run in.
  const marcus = await ctxAs("marcus");
  const s = await openSession("Quality librarian");
  await addDocument(marcus, { session_id: s.id, title: "Guide", audience: "learners", file: fileOf(REBUILD_GUIDE_MD, "guide.md") });
  await marcus.runJobs();
  await askQuestion(await ctxAs("grace"), { session_id: s.id, text: "How do I find my project ID?", anonymous: true });
  await marcus.runJobs();
});

function deps(now: Date, outbox: Email[] = []) {
  return { admin: admin(), now: () => now, mailer: { send: async (e: Email) => void outbox.push(e) } };
}

describe("agent runs", () => {
  it("every agent call writes a row with the agent, version, model, tokens, cost, latency and outcome; anonymous and private rows carry no learner id", async () => {
    const s = await openSession("Agent runs");
    const named = await interviewToReadBack("aisha", s.id, "named");
    await submit(named);
    const anon = await interviewToReadBack("ben", s.id, "anonymous");
    await submit(anon);
    const priv = await interviewToReadBack("chloe", s.id, "private");
    await submit(priv);
    await named.ctx.runJobs();

    const rows = await sql()`select interview_id, agent, agent_version, model, operation, input_tokens, output_tokens, cost_usd, latency_ms, outcome, learner_id
                             from public.agent_runs where interview_id = any(${[named.interview.id, anon.interview.id, priv.interview.id]})`;
    expect(new Set(rows.map((r) => r.agent))).toEqual(new Set(["interviewer", "analyst", "judge"]));
    for (const r of rows) {
      expect(r.agent_version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.model).toMatch(/^stub\//);
      expect(r.input_tokens).toBeGreaterThan(0);
      expect(Number(r.cost_usd)).toBeGreaterThanOrEqual(0);
      expect(r.latency_ms).toBeGreaterThanOrEqual(0);
      expect(["ok", "validation_failed", "error"]).toContain(r.outcome);
    }
    const aisha = await userId("aisha");
    expect(rows.filter((r) => r.interview_id === named.interview.id).every((r) => r.learner_id === aisha)).toBe(true);
    expect(rows.filter((r) => r.interview_id !== named.interview.id).every((r) => r.learner_id === null)).toBe(true);
    // Every agent writes runs: the Librarian and Brand designer too.
    const agents = await sql()`select distinct agent from public.agent_runs`;
    expect(agents.map((a) => a.agent)).toEqual(expect.arrayContaining(["interviewer", "analyst", "librarian", "judge"]));
  });
});

describe("the rubric job", () => {
  it("scores named and anonymous interviews on every item, and private ones on the code-checked items only", async () => {
    const s = await openSession("Rubric");
    const anon = await interviewToReadBack("diego", s.id, "anonymous");
    await submit(anon);
    const priv = await interviewToReadBack("elena", s.id, "private");
    await submit(priv);
    await anon.ctx.runJobs();
    const checks = await sql()`select interview_id, items, passed, total, code_only from public.quality_checks where interview_id = any(${[anon.interview.id, priv.interview.id]})`;
    const a = checks.find((c) => c.interview_id === anon.interview.id)!;
    const p = checks.find((c) => c.interview_id === priv.interview.id)!;
    expect(a.code_only).toBe(false);
    expect(new Set((a.items as Array<{ method: string }>).map((i) => i.method))).toEqual(new Set(["code", "judge"]));
    expect(p.code_only).toBe(true);
    expect((p.items as Array<{ item: string; method: string }>).map((i) => i.item).sort()).toEqual(["limits_respected", "topics_covered"]);
    expect((p.items as Array<{ method: string }>).every((i) => i.method === "code")).toBe(true);
    // Running it again on a private interview still works without a transcript.
    const again = await scoreInterview({ interview_id: priv.interview.id }, deps(new Date()));
    expect(again?.codeOnly).toBe(true);
  });
});

describe("the quality page", () => {
  it("shows each figure by agent and AGENT.md version, for the platform admin only", async () => {
    const q = await getQuality(await ctxAs("platformAdmin"));
    // Grouped by the version in AGENT.md that each run used.
    const interviewer = q.rows.find((r) => r.agent === "interviewer" && r.version === loadAgentFile("interviewer").version)!;
    expect(interviewer).toBeDefined();
    for (const key of ["runs", "validation_failure_rate", "rubric_pass_rate", "read_backs_confirmed_without_edits", "abandon_rate", "median_turns", "cost_per_interview_usd"] as const) {
      expect(interviewer[key], key).not.toBeNull();
    }
    const librarian = q.rows.find((r) => r.agent === "librarian");
    expect(librarian).toBeDefined();
    expect(Object.keys(librarian!)).toEqual(expect.arrayContaining(["ai_answers_verified_without_edits", "questions_sources_could_not_answer"]));
    expect(await statusOf(getQuality(await ctxAs("dana")))).toBe(403);
  });
});

describe("alerts", () => {
  it("email the platform admin when results are under the pass marks", async () => {
    const now = new Date();
    for (let i = 0; i < 20; i++) {
      await sql()`insert into public.quality_checks (organization_id, agent, agent_version, kind, items, passed, total) values (${ids.streamspace}, 'interviewer', 'alert-test', 'rubric', '[]', 2, 10)`;
      await sql()`insert into public.agent_runs (organization_id, agent, agent_version, model, operation, outcome) values (${ids.streamspace}, 'analyst', 'alert-test', 'stub', 'alert-test', 'validation_failed')`;
    }
    const outbox: Email[] = [];
    const alerts = await checkAlerts(deps(now, outbox));
    expect(alerts.length).toBe(2);
    expect(outbox.map((e) => [e.to, e.subject])).toEqual([["sam.rivera@platform.example", "Agent quality alert"]]);
    expect(outbox[0].text).toMatch(/under the 85% mark/);
    expect(await checkAlerts(deps(now, outbox))).toEqual([]);
    expect(outbox.length).toBe(1);
    await sql()`delete from public.quality_checks where agent_version = 'alert-test'`;
    await sql()`delete from public.agent_runs where agent_version = 'alert-test'`;
  });
});

describe("the labelled set", () => {
  it("an interview marked Not accurate appears among the candidates", async () => {
    const s = await openSession("Accuracy");
    const learners = await Promise.all(STREAMSPACE_LEARNERS.slice(0, 7).map((k) => userId(k)));
    await seedDemoInterviews(admin(), s.id, learners);
    const marcus = await ctxAs("marcus");
    const list = await listInterviews(marcus, { session_id: s.id }, { withRefs: true });
    const target = list.anonymous[0];
    await markInsightAccuracy(marcus, target.seal!, "not_accurate");
    const q = await getQuality(await ctxAs("platformAdmin"));
    expect(q.candidates.some((c) => c.course === "Streamspace platform training: IME Engineering" && c.analyst_version === "demo")).toBe(true);
    // A sponsor can't mark anything.
    expect(await statusOf(markInsightAccuracy(await ctxAs("priya"), list.named[0].seal!, "accurate"))).toBe(404);
  });
});

describe("reminders", () => {
  it("go once 24 hours after a session opens and once 24 hours before it closes, and never to a learner who submitted", async () => {
    const opened = new Date("2027-03-01T09:00:00Z");
    const s = await openSession("Reminders");
    await sql()`update public.sessions set opened_at = ${opened}, closes_at = ${new Date(opened.getTime() + 7 * 86_400_000)} where id = ${s.id}`;
    const submitted = [await userId("aisha"), await userId("ben")];
    for (const u of submitted) {
      await sql()`insert into public.completions (organization_id, course_id, session_id, user_id, kind) values (${ids.streamspace}, ${ids.ime}, ${s.id}, ${u}, 'session')`;
    }
    const [{ n: enrolled }] = await sql()`select count(*)::int as n from public.enrollments where course_id = ${ids.ime}`;
    const mine = (box: Email[]) => box.filter((e) => e.subject.includes(`Session ${s.number}`));
    const at = (hours: number) => new Date(opened.getTime() + hours * 3_600_000);

    const box: Email[] = [];
    await sendReminders(deps(at(23), box));
    expect(mine(box)).toEqual([]);
    await sendReminders(deps(at(25), box));
    expect(mine(box).length).toBe(enrolled - 2);
    expect(mine(box).map((e) => e.to)).not.toContain("aisha.bello@ime-engineering.example");
    await sendReminders(deps(at(26), box));
    expect(mine(box).length).toBe(enrolled - 2);
    await sendReminders(deps(at(6 * 24 + 1), box));
    const closing = mine(box).filter((e) => e.subject.startsWith("Last day"));
    expect(closing.length).toBe(enrolled - 2);
    expect(closing.map((e) => e.to)).not.toContain("ben.carter@ime-engineering.example");
    await sendReminders(deps(at(6 * 24 + 2), box));
    expect(mine(box).length).toBe(2 * (enrolled - 2));
  });
});

describe("the follow-up interview", () => {
  it("opens follow_up_days after the last session, asks about use at work, and feeds the Applied at work tile", async () => {
    await sql()`update public.courses set min_group_size = 1 where id = ${ids.nwCourse}`;
    const before = new Date("2026-12-05T10:00:00Z"); // 25 days after 10 November
    const after = new Date("2026-12-11T10:00:00Z"); // 31 days after
    const early = await ctxAs("kofi", { now: () => before });
    expect(await statusOf(startInterview(early, { session_id: ids.nw1, anonymity: "anonymous", kind: "follow_up" }))).toBe(409);

    const ctx = await ctxAs("kofi", { now: () => after });
    const started = await startInterview(ctx, { session_id: ids.nw1, anonymity: "anonymous", kind: "follow_up" });
    expect(started.messages[0].text).toMatch(/follow-up on how the course has helped at work/);
    let iv = (await sendTurn(ctx, { interview_id: started.interview.id, text: "Ready", mode: "text" })).interview;
    expect(iv.pending_rating?.id).toBe("applied");
    const first = await saveRating(ctx, { interview_id: iv.id, item_id: "applied", choice: "yes_once_or_twice" });
    iv = first.interview;
    expect(first.reply?.text).toMatch(/what have you used at work/i);
    const [row] = await sql()`select progress from public.interviews where id = ${iv.id}`;
    expect((row.progress as { topics: Array<{ id: string }> }).topics.map((t) => t.id)).toEqual(["used_at_work", "what_stopped", "support_needed"]);
    for (const text of ["I used the account checklist with two new customers last week.", "Time: the welcome calls overran so I skipped the milestone step.", "A one-page version of the checklist would help me a lot."]) {
      if (iv.stage !== "conversation") break;
      iv = (await sendTurn(ctx, { interview_id: iv.id, text, mode: "text" })).interview;
    }
    expect(iv.stage).toBe("read_back");
    await submitInterview(ctx, { interview_id: iv.id, anonymity: "anonymous", summary: iv.summary! });
    await ctx.runJobs();
    const results = await getFollowUpResults(await ctxAs("owen"), ids.nw1);
    expect(results.tiles?.applied).toMatchObject({ count: 1, of: 1 });
    await sql()`update public.courses set min_group_size = 5 where id = ${ids.nwCourse}`;
  });
});

describe("retention", () => {
  it("deletes transcripts older than retention_days, with a fake clock", async () => {
    const s = await openSession("Retention");
    const learners = await Promise.all(STREAMSPACE_LEARNERS.slice(0, 7).map((k) => userId(k)));
    const ivs = await seedDemoInterviews(admin(), s.id, learners);
    const now = new Date();
    const old = new Date(now.getTime() - 400 * 86_400_000);
    await sql()`update public.interviews set submitted_at = ${old} where id = ${ivs[0]}`;
    await applyRetention(deps(now));
    const left = await sql()`select interview_id, count(*)::int as n from public.interview_turns where interview_id = any(${ivs.slice(0, 2)}) group by interview_id`;
    expect(left.map((l) => l.interview_id)).toEqual([ivs[1]]);
    const [insight] = await sql()`select count(*)::int as n from public.insights where interview_id = ${ivs[0]}`;
    expect(insight.n).toBe(1);
  });

  it("a learner's request removes their named interviews and questions, and leaves anonymous ones", async () => {
    const s = await openSession("Remove my data");
    const named = await interviewToReadBack("farid", s.id, "named");
    await submit(named);
    const otherSession = await openSession("Remove my data, anonymous");
    const anon = await interviewToReadBack("farid", otherSession.id, "anonymous");
    await submit(anon);
    const farid = await ctxAs("farid");
    await askQuestion(farid, { session_id: s.id, text: "Where is the recording?", anonymous: false });
    const result = await deleteMyData(farid, ids.ime);
    expect(result).toMatchObject({ interviews: 1 });
    expect(result.questions).toBeGreaterThanOrEqual(1);
    const [a] = await sql()`select count(*)::int as n from public.interviews where id = ${named.interview.id}`;
    const [b] = await sql()`select count(*)::int as n from public.interviews where id = ${anon.interview.id}`;
    const [c] = await sql()`select count(*)::int as n from public.questions where author_id = ${await userId("farid")}`;
    expect([a.n, b.n, c.n]).toEqual([0, 1, 0]);
  });
});

describe("the rubric judge", () => {
  it("keeps a verdict with a long reason, trimmed, and tries again once when its first answer is unusable", async () => {
    let calls = 0;
    const long = "The read-back follows the learner closely. ".repeat(20);
    overrideStubBrain("judge", () => {
      calls++;
      if (calls === 1) return { text: "not a verdict" };
      const v = { verdict: "pass", reason: long };
      return { text: JSON.stringify({ one_question_per_turn: v, no_leading_questions: v, read_back_matches: v, decline_accepted: { verdict: "n/a", reason: "No decline" }, injection_ignored: { verdict: "n/a", reason: "None" } }) };
    });
    try {
      const judged = await judgeTranscript(languageModel("judge"), [{ role: "interviewer", text: "What was most useful?", stage: "conversation" }, { role: "learner", text: "The practice.", stage: "conversation" }], ["You found the practice most useful."]);
      expect(judged.error).toBeUndefined();
      expect(calls).toBe(2);
      expect(judged.results.map((r) => r.item)).toEqual(["one_question_per_turn", "no_leading_questions", "read_back_matches"]);
      expect(judged.results.every((r) => r.passed && (r.note?.length ?? 0) === 300)).toBe(true);
    } finally {
      overrideStubBrain("judge", null);
    }
  });
});
