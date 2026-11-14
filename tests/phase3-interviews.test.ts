import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { sendTurn, saveRating, startInterview, submitInterview } from "@/lib/server/ops/interviews";
import { INTERVIEWER_TOOL_NAMES } from "@/agents/interviewer/tools";
import { overrideStubBrain } from "@/lib/server/ai/models";
import { seeded, sql, userId } from "./support/db";
import { ctxAs, statusOf } from "./support/ctx";
import { interviewToReadBack, LONG_ANSWERS, openSession, submit } from "./support/interview";

let ids: Awaited<ReturnType<typeof seeded>>;
beforeAll(async () => {
  ids = await seeded();
});
afterEach(() => {
  overrideStubBrain("interviewer", null);
  overrideStubBrain("analyst", null);
});

describe("the Interviewer's tools", () => {
  it("are exactly save_rating, raise_question, flag_blocker and end_interview", () => {
    expect(INTERVIEWER_TOOL_NAMES).toEqual(["end_interview", "flag_blocker", "raise_question", "save_rating"]);
  });
});

describe("a named interview", () => {
  it("goes through consent, four ratings, the conversation, the read-back and submission, and ends analysed", async () => {
    const s = await openSession("Named interview");
    const run = await interviewToReadBack("aisha", s.id, "named");
    expect(run.interview.stage).toBe("read_back");
    expect(run.interview.summary?.length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(run.interview.ratings).sort()).toEqual(["ability", "pace", "recommend", "relevance"]);
    await submit(run);
    await run.ctx.runJobs();

    const [iv] = await sql()`select id, state, participant_id, anonymity from public.interviews where id = ${run.interview.id}`;
    expect(iv.state).toBe("analysed");
    expect(iv.participant_id).toBe(await userId("aisha"));

    const turns = await sql()`select seq, role, stage, mode, text from public.interview_turns where interview_id = ${iv.id} order by seq`;
    expect(turns.map((t) => t.seq)).toEqual(turns.map((_, i) => i + 1));
    expect(turns[0]).toMatchObject({ role: "interviewer", stage: "consent" });
    const stages = turns.map((t) => t.stage);
    expect(stages.indexOf("ratings")).toBeLessThan(stages.indexOf("conversation"));
    expect(stages.lastIndexOf("conversation")).toBeLessThan(stages.lastIndexOf("read_back"));
    expect(turns.filter((t) => t.mode === "chip").map((t) => t.text)).toEqual(["Yes, with the guide beside me", "About right", "Most of it", "8"]);
    const learnerTexts = turns.filter((t) => t.role === "learner" && t.mode === "text").map((t) => t.text);
    expect(learnerTexts).toEqual(run.turns);

    const [insight] = await sql()`select themes, quotes from public.insights where interview_id = ${iv.id}`;
    expect((insight.themes as unknown[]).length).toBeGreaterThan(0);
  });
});

describe("an anonymous interview", () => {
  it("has no participant_id, and a completion row with a date and no time", async () => {
    const s = await openSession("Anonymous interview");
    const run = await interviewToReadBack("ben", s.id, "anonymous");
    await submit(run);
    await run.ctx.runJobs();
    const [iv] = await sql()`select participant_id, state, started_at, submitted_at from public.interviews where id = ${run.interview.id}`;
    expect(iv.participant_id).toBeNull();
    expect(iv.state).toBe("analysed");
    // Times are cut to the date, so they can't be matched with anything.
    expect(new Date(iv.submitted_at).toISOString()).toMatch(/T00:00:00\.000Z$/);
    expect(new Date(iv.started_at).toISOString()).toMatch(/T00:00:00\.000Z$/);
    const completions = await sql()`select * from public.completions where session_id = ${s.id} and user_id = ${await userId("ben")}`;
    expect(completions.length).toBe(1);
    expect(completions[0].completed_on).toBeInstanceOf(Date);
    expect(Object.keys(completions[0]).sort()).toEqual(["completed_on", "course_id", "id", "kind", "organization_id", "session_id", "user_id"]);
  });

  it("schema: no column or key links completions and interviews, and completions hold no time", async () => {
    const fks = await sql()`
      select conname from pg_constraint
      where contype = 'f'
        and ((conrelid = 'public.completions'::regclass and confrelid = 'public.interviews'::regclass)
          or (conrelid = 'public.interviews'::regclass and confrelid = 'public.completions'::regclass))`;
    expect(fks).toEqual([]);
    const cols = await sql()`
      select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public' and table_name in ('completions', 'interviews')`;
    expect(cols.filter((c) => c.table_name === "completions" && /interview/.test(c.column_name))).toEqual([]);
    expect(cols.filter((c) => c.table_name === "interviews" && /completion/.test(c.column_name))).toEqual([]);
    expect(cols.filter((c) => c.table_name === "completions" && /time/.test(c.data_type))).toEqual([]);
    // The only shared columns are the tenancy and session keys every row carries.
    const completionCols = new Set(cols.filter((c) => c.table_name === "completions").map((c) => c.column_name));
    const shared = cols.filter((c) => c.table_name === "interviews" && completionCols.has(c.column_name)).map((c) => c.column_name).sort();
    expect(shared).toEqual(["course_id", "id", "kind", "organization_id", "session_id"]);
  });
});

describe("a private interview", () => {
  it("keeps no turns after analysis, and its insights hold paraphrases and no quotes", async () => {
    const s = await openSession("Private interview");
    const run = await interviewToReadBack("chloe", s.id, "private");
    await submit(run);
    await run.ctx.runJobs();
    const turns = await sql()`select count(*)::int as n from public.interview_turns where interview_id = ${run.interview.id}`;
    expect(turns[0].n).toBe(0);
    const [insight] = await sql()`select quotes, paraphrases from public.insights where interview_id = ${run.interview.id}`;
    expect(insight.quotes).toEqual([]);
    expect((insight.paraphrases as unknown[]).length).toBeGreaterThan(0);
    const [iv] = await sql()`select participant_id, summary, state from public.interviews where id = ${run.interview.id}`;
    expect(iv).toMatchObject({ participant_id: null, summary: null, state: "analysed" });
  });
});

describe("start_interview", () => {
  it("is 403 for someone not enrolled, 409 for a session that isn't open, and 409 after submitting", async () => {
    const s = await openSession("Start rules");
    expect(await statusOf(startInterview(await ctxAs("marcus"), { session_id: s.id, anonymity: "anonymous", kind: "session" }))).toBe(403);
    expect(await statusOf(startInterview(await ctxAs("diego"), { session_id: ids.s2, anonymity: "anonymous", kind: "session" }))).toBe(409);
    const run = await interviewToReadBack("diego", s.id, "named");
    await submit(run);
    expect(await statusOf(startInterview(run.ctx, { session_id: s.id, anonymity: "anonymous", kind: "session" }))).toBe(409);
    expect(await statusOf(startInterview(await ctxAs("isla"), { session_id: s.id, anonymity: "anonymous", kind: "session" }))).toBe(404);
  });
});

describe("send_turn", () => {
  it("is 401 without a valid token", async () => {
    const s = await openSession("Token");
    const owner = await ctxAs("elena");
    const { interview } = await startInterview(owner, { session_id: s.id, anonymity: "anonymous", kind: "session" });
    const stranger = await ctxAs("elena"); // same learner, another browser: no cookie
    expect(await statusOf(sendTurn(stranger, { interview_id: interview.id, text: "hello", mode: "text" }))).toBe(401);
    stranger.jar.set([...owner.jar.keys()][0], "not-the-token");
    expect(await statusOf(sendTurn(stranger, { interview_id: interview.id, text: "hello", mode: "text" }))).toBe(401);
  });

  it("moves to the read-back at turn 14 and returns 409 past the hard limit", async () => {
    // A model that never moves on: only the code's limit can end the conversation.
    overrideStubBrain("interviewer", (call) =>
      call.context.stage === "read_back"
        ? { text: JSON.stringify({ points: ["One", "Two", "Three"] }) }
        : { text: JSON.stringify({ reply: "Tell me more?", topic_action: "stay", learner_declined: false, offered_to_post_question: false }) },
    );
    const s = await openSession("Turn limit");
    const ctx = await ctxAs("farid");
    let { interview } = await startInterview(ctx, { session_id: s.id, anonymity: "private", kind: "session" });
    interview = (await sendTurn(ctx, { interview_id: interview.id, text: "Ready", mode: "text" })).interview;
    for (const item of ["ability", "pace", "relevance", "recommend"]) {
      interview = (await saveRating(ctx, { interview_id: interview.id, item_id: item, choice: "prefer_not_to_say" })).interview;
    }
    for (let turn = 2; turn <= 13; turn++) {
      interview = (await sendTurn(ctx, { interview_id: interview.id, text: `Answer ${turn}`, mode: "text" })).interview;
      expect(interview.stage, `turn ${turn}`).toBe("conversation");
    }
    interview = (await sendTurn(ctx, { interview_id: interview.id, text: "Answer 14", mode: "text" })).interview;
    expect(interview.turn_count).toBe(14);
    expect(interview.stage).toBe("read_back");
    for (let turn = 15; turn <= 18; turn++) await sendTurn(ctx, { interview_id: interview.id, text: `Correction ${turn}`, mode: "text" });
    expect(await statusOf(sendTurn(ctx, { interview_id: interview.id, text: "One more", mode: "text" }))).toBe(409);
  });
});

describe("ratings at submission", () => {
  it("allows Prefer not to say on every rating", async () => {
    const s = await openSession("All skipped");
    const run = await interviewToReadBack("grace", s.id, "anonymous", {
      choices: { ability: "prefer_not_to_say", pace: "prefer_not_to_say", relevance: "prefer_not_to_say", recommend: "prefer_not_to_say" },
    });
    expect(await statusOf(submit(run))).toBe(200);
  });

  it("returns 422 when a rating is left unanswered", async () => {
    const s = await openSession("One missing");
    const run = await interviewToReadBack("hamish", s.id, "anonymous", { skipRating: "recommend" });
    expect(run.interview.stage).toBe("ratings");
    expect(await statusOf(submitInterview(run.ctx, { interview_id: run.interview.id, anonymity: "anonymous", summary: ["A point"] }))).toBe(422);
    const completions = await sql()`select count(*)::int as n from public.completions where session_id = ${s.id}`;
    expect(completions[0].n).toBe(0);
  });
});

describe("the Analyst", () => {
  it("drops a quote that isn't in the learner's turns", async () => {
    const real = LONG_ANSWERS[0];
    overrideStubBrain("analyst", () => ({
      text: JSON.stringify({
        themes: [{ theme: "Hands-on practice", sentiment: "positive", paraphrase: "Liked rebuilding the workflow." }],
        blockers: [],
        suggestions: [],
        quotes: [
          { text: "The instructor was the best I have ever had.", theme: "Instructor delivery" },
          { text: real, theme: "Hands-on practice" },
        ],
        paraphrases: [{ text: "Liked rebuilding the workflow.", theme: "Hands-on practice" }],
      }),
    }));
    const s = await openSession("Quote check");
    const run = await interviewToReadBack("aisha", s.id, "anonymous");
    await submit(run);
    await run.ctx.runJobs();
    const [insight] = await sql()`select quotes from public.insights where interview_id = ${run.interview.id}`;
    expect(insight.quotes).toEqual([{ text: real, theme: "Hands-on practice" }]);
  });

  it("retries a theme outside the list once, then marks the interview needs_review", async () => {
    let calls = 0;
    overrideStubBrain("analyst", () => {
      calls++;
      return {
        text: JSON.stringify({
          themes: [{ theme: "Catering", sentiment: "negative", paraphrase: "Lunch was late." }],
          blockers: [],
          suggestions: [],
          quotes: [],
          paraphrases: [],
        }),
      };
    });
    const s = await openSession("Bad theme");
    const run = await interviewToReadBack("ben", s.id, "named");
    await submit(run);
    await run.ctx.runJobs();
    expect(calls).toBe(2);
    const [iv] = await sql()`select state from public.interviews where id = ${run.interview.id}`;
    expect(iv.state).toBe("needs_review");
    const runs = await sql()`select outcome from public.agent_runs where interview_id = ${run.interview.id} and agent = 'analyst'`;
    expect(runs.map((r) => r.outcome)).toEqual(["validation_failed", "validation_failed"]);
    const insights = await sql()`select count(*)::int as n from public.insights where interview_id = ${run.interview.id}`;
    expect(insights[0].n).toBe(0);
  });
});

describe("raise_question", () => {
  async function toConversation(who: "chloe" | "diego", title: string) {
    const s = await openSession(title);
    const ctx = await ctxAs(who);
    let { interview } = await startInterview(ctx, { session_id: s.id, anonymity: "anonymous", kind: "session" });
    interview = (await sendTurn(ctx, { interview_id: interview.id, text: "Ready", mode: "text" })).interview;
    for (const item of ["ability", "pace", "relevance", "recommend"]) {
      interview = (await saveRating(ctx, { interview_id: interview.id, item_id: item, choice: "prefer_not_to_say" })).interview;
    }
    return { s, ctx, interview };
  }

  it("stores an open question on the session when the learner agrees", async () => {
    const { s, ctx, interview } = await toConversation("chloe", "Question agreed");
    const offer = await sendTurn(ctx, { interview_id: interview.id, text: "How do I find my project ID?", mode: "text" });
    expect(offer.reply.text).toMatch(/post it/i);
    await sendTurn(ctx, { interview_id: interview.id, text: "Yes please", mode: "text" });
    const qs = await sql()`select text, state, origin, author_id from public.questions where session_id = ${s.id}`;
    expect(qs).toEqual([{ text: "How do I find my project ID?", state: "open", origin: "interview", author_id: null }]);
  });

  it("stores nothing without agreement", async () => {
    const { s, ctx, interview } = await toConversation("diego", "Question declined");
    await sendTurn(ctx, { interview_id: interview.id, text: "How do I find my project ID?", mode: "text" });
    await sendTurn(ctx, { interview_id: interview.id, text: "No thanks, carry on", mode: "text" });
    const qs = await sql()`select count(*)::int as n from public.questions where session_id = ${s.id}`;
    expect(qs[0].n).toBe(0);
  });

  it("code refuses a raise_question the model calls without having offered first", async () => {
    overrideStubBrain("interviewer", (call) =>
      call.toolResults.length
        ? { text: JSON.stringify({ reply: "Next question?", topic_action: "stay", learner_declined: false, offered_to_post_question: false }) }
        : { toolCalls: [{ name: "raise_question", input: { text: "Posted without asking?" } }] },
    );
    const { s, ctx, interview } = await toConversation("chloe", "Question unasked");
    await sendTurn(ctx, { interview_id: interview.id, text: "The guide was fine.", mode: "text" });
    const qs = await sql()`select count(*)::int as n from public.questions where session_id = ${s.id}`;
    expect(qs[0].n).toBe(0);
  });
});

describe("blockers", () => {
  it("are sent to the instructor at once", async () => {
    const s = await openSession("Blocker");
    const ctx = await ctxAs("elena");
    let { interview } = await startInterview(ctx, { session_id: s.id, anonymity: "anonymous", kind: "session" });
    interview = (await sendTurn(ctx, { interview_id: interview.id, text: "Ready", mode: "text" })).interview;
    for (const item of ["ability", "pace", "relevance", "recommend"]) {
      interview = (await saveRating(ctx, { interview_id: interview.id, item_id: item, choice: "prefer_not_to_say" })).interview;
    }
    await sendTurn(ctx, { interview_id: interview.id, text: "Honestly I still can't log in to the workspace at all.", mode: "text" });
    const jobs = await sql()`select payload from public.jobs where kind = 'notify_blocker' and payload->>'session_id' = ${s.id}`;
    expect(jobs.length).toBe(1);
    await ctx.runJobs();
    // Other interviews in this file report blockers too; count only this session's emails.
    const mine = ctx.outbox.filter((e) => e.subject === `A learner is blocked after Session ${s.number}`);
    expect(mine.map((e) => e.to).sort()).toEqual(["dana.whitfield@streamspace.example", "marcus.lindqvist@streamspace.example"]);
    expect(mine[0].text).toContain("I still can't log in");
  });
});
