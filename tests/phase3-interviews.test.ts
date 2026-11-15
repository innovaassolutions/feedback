import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { sendTurn, saveRating, startInterview, submitInterview } from "@/lib/server/ops/interviews";
import { INTERVIEWER_TOOL_NAMES } from "@/agents/interviewer/tools";
import { interviewerModel, languageModel, overrideStubBrain, reasoningLevel } from "@/lib/server/ai/models";
import { voiceModelId } from "@/lib/server/ai/provider";
import { handleChip, handleLearnerTurn, initialProgress, UPDATED_ON_SCREEN, type EngineSetup, type EngineState } from "@/agents/interviewer/engine";
import { DEFAULT_SESSION_GUIDE } from "@/lib/guide";
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

  it("answers a request at the read-back that isn't a correction, and leaves the summary as it was", async () => {
    const s = await openSession("Start again");
    const { ctx, interview } = await interviewToReadBack("diego", s.id, "anonymous");
    const before = await sql()`select progress->'proposed_summary' as points from public.interviews where id = ${interview.id}`;
    const turn = await sendTurn(ctx, { interview_id: interview.id, text: "Can we start the interview again?", mode: "voice" });
    expect(turn.reply.text).toMatch(/can't start the interview again/i);
    expect(turn.interview.stage).toBe("read_back");
    const after = await sql()`select progress->'proposed_summary' as points from public.interviews where id = ${interview.id}`;
    expect(after[0].points).toEqual(before[0].points);
  });

  it("keeps the summary when the model calls a reply other but changes the points anyway", async () => {
    const s = await openSession("Other with changes");
    const { ctx, interview } = await interviewToReadBack("elena", s.id, "anonymous");
    const before = await sql()`select progress->'proposed_summary' as points from public.interviews where id = ${interview.id}`;
    overrideStubBrain("interviewer", () => ({ text: JSON.stringify({ points: ["Something the learner never said."], request: "other", reply: "Happy to help." }) }));
    const turn = await sendTurn(ctx, { interview_id: interview.id, text: "Thanks, that was quick.", mode: "text" });
    expect(turn.reply.text).toBe("Happy to help.");
    const after = await sql()`select progress->'proposed_summary' as points from public.interviews where id = ${interview.id}`;
    expect(after[0].points).toEqual(before[0].points);
  });

  it("confirms a spoken correction at the read-back briefly, instead of reading the whole summary again", async () => {
    const s = await openSession("Spoken correction");
    const { ctx, interview } = await interviewToReadBack("hamish", s.id, "anonymous");
    const typed = await sendTurn(ctx, { interview_id: interview.id, text: "Point two should say the pace was fine.", mode: "text" });
    expect(typed.reply.text).toMatch(/^I've updated the summary\. Here's what I heard/);
    const spoken = await sendTurn(ctx, { interview_id: interview.id, text: "Also remove the last point.", mode: "voice" });
    expect(spoken.reply.text).toBe(UPDATED_ON_SCREEN);
    expect(spoken.interview.stage).toBe("read_back");
  });

  it("counts time spent in the interview, so a learner who comes back later isn't already at time", async () => {
    // A model that never moves on: only the time limit can end the conversation.
    overrideStubBrain("interviewer", (call) =>
      call.context.stage === "read_back"
        ? { text: JSON.stringify({ points: ["One", "Two", "Three"] }) }
        : { text: JSON.stringify({ reply: "Tell me more?", topic_action: "stay", learner_declined: false, offered_to_post_question: false }) },
    );
    let now = new Date();
    const s = await openSession("Come back later");
    const ctx = await ctxAs("grace", { now: () => now });
    let { interview } = await startInterview(ctx, { session_id: s.id, anonymity: "anonymous", kind: "session" });
    interview = (await sendTurn(ctx, { interview_id: interview.id, text: "Ready", mode: "text" })).interview;
    for (const item of ["ability", "pace", "relevance", "recommend"]) {
      interview = (await saveRating(ctx, { interview_id: interview.id, item_id: item, choice: "prefer_not_to_say" })).interview;
    }
    // Away for 40 minutes, then back: the gap counts as five.
    now = new Date(now.getTime() + 40 * 60_000);
    let turn = await sendTurn(ctx, { interview_id: interview.id, text: "The practice was the most useful part.", mode: "text" });
    expect(turn.interview.stage).toBe("conversation");
    // Steady use still meets the 15-minute limit: 5 + 4.9 + 4.9 minutes, then the next turn is at time.
    for (let i = 0; i < 2; i++) {
      now = new Date(now.getTime() + 4.9 * 60_000);
      turn = await sendTurn(ctx, { interview_id: interview.id, text: `More detail ${i}`, mode: "text" });
      expect(turn.interview.stage).toBe("conversation");
    }
    now = new Date(now.getTime() + 4.9 * 60_000);
    turn = await sendTurn(ctx, { interview_id: interview.id, text: "And one more thing.", mode: "text" });
    expect(turn.interview.stage).toBe("read_back");
    expect(turn.reply.text).toMatch(/^We're at time/);
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

  it("are flagged at most once per turn, however often the model calls flag_blocker", async () => {
    overrideStubBrain("interviewer", (call) =>
      call.toolResults.length
        ? { text: JSON.stringify({ reply: "Sorry to hear that. What else?", topic_action: "stay", learner_declined: false, offered_to_post_question: false, learner_is_blocked: true }) }
        : { toolCalls: [{ name: "flag_blocker", input: { summary: "Can't log in" } }, { name: "flag_blocker", input: { summary: "Still can't log in" } }] },
    );
    const { s, ctx, interview } = await toConversationAs("elena", "One blocker per turn");
    await sendTurn(ctx, { interview_id: interview.id, text: "I still can't log in.", mode: "text" });
    const jobs = await sql()`select count(*)::int as n from public.jobs where kind = 'notify_blocker' and payload->>'session_id' = ${s.id}`;
    expect(jobs[0].n).toBe(1);
  });

  it("aren't sent when the reply doesn't confirm the learner is blocked, or the summary is a placeholder", async () => {
    let blocked = false;
    let summary = "Can't open the workspace";
    overrideStubBrain("interviewer", (call) =>
      call.toolResults.length
        ? { text: JSON.stringify({ reply: "Thanks. What else?", topic_action: "stay", learner_declined: false, offered_to_post_question: false, learner_is_blocked: blocked }) }
        : { toolCalls: [{ name: "flag_blocker", input: { summary } }] },
    );
    const { s, ctx, interview } = await toConversationAs("farid", "Unconfirmed blocker");
    await sendTurn(ctx, { interview_id: interview.id, text: "I was stuck for a few minutes until someone helped.", mode: "text" });
    blocked = true;
    summary = "placeholder";
    await sendTurn(ctx, { interview_id: interview.id, text: "Then it was fine.", mode: "text" });
    const jobs = await sql()`select count(*)::int as n from public.jobs where kind = 'notify_blocker' and payload->>'session_id' = ${s.id}`;
    expect(jobs[0].n).toBe(0);
  });
});

/** Consent and four chip ratings, ending in the conversation stage. */
async function toConversationAs(who: "chloe" | "diego" | "elena" | "farid", title: string) {
  const s = await openSession(title);
  const ctx = await ctxAs(who);
  let { interview } = await startInterview(ctx, { session_id: s.id, anonymity: "anonymous", kind: "session" });
  interview = (await sendTurn(ctx, { interview_id: interview.id, text: "Ready", mode: "text" })).interview;
  for (const item of ["ability", "pace", "relevance", "recommend"]) {
    interview = (await saveRating(ctx, { interview_id: interview.id, item_id: item, choice: "prefer_not_to_say" })).interview;
  }
  return { s, ctx, interview };
}

describe("the model's reasoning", () => {
  it("is minimal unless AI_REASONING names another level", () => {
    const before = process.env.AI_REASONING;
    try {
      delete process.env.AI_REASONING;
      expect(reasoningLevel()).toBe("minimal");
      process.env.AI_REASONING = "medium";
      expect(reasoningLevel()).toBe("medium");
      process.env.AI_REASONING = "lots";
      expect(reasoningLevel()).toBe("minimal");
    } finally {
      if (before === undefined) delete process.env.AI_REASONING;
      else process.env.AI_REASONING = before;
    }
  });
});

describe("the voice model", () => {
  it("is AI_MODEL_INTERVIEWER_VOICE for spoken turns when set, and the Interviewer's own model otherwise", () => {
    const keep = { provider: process.env.AI_PROVIDER, voice: process.env.AI_MODEL_INTERVIEWER_VOICE, model: process.env.AI_MODEL_INTERVIEWER };
    try {
      process.env.AI_PROVIDER = "gateway";
      process.env.AI_MODEL_INTERVIEWER = "anthropic/claude-sonnet-5.5";
      delete process.env.AI_MODEL_INTERVIEWER_VOICE;
      expect(voiceModelId()).toBe("anthropic/claude-sonnet-5.5");
      process.env.AI_MODEL_INTERVIEWER_VOICE = "anthropic/claude-haiku-5.5";
      expect(voiceModelId()).toBe("anthropic/claude-haiku-5.5");
      expect(interviewerModel(true).id).toBe("anthropic/claude-haiku-5.5");
      expect(interviewerModel(false).id).toBe("anthropic/claude-sonnet-5.5");
    } finally {
      for (const [k, v] of [["AI_PROVIDER", keep.provider], ["AI_MODEL_INTERVIEWER_VOICE", keep.voice], ["AI_MODEL_INTERVIEWER", keep.model]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe("a model turn", () => {
  it("offers no tools on its last step, so a model that keeps calling tools still ends in a reply", async () => {
    const seen: string[][] = [];
    overrideStubBrain("interviewer", (call) => {
      seen.push([...call.toolNames].sort());
      return call.toolNames.length
        ? { toolCalls: [{ name: "flag_blocker", input: { summary: "Again" } }] }
        : { text: JSON.stringify({ reply: "Thanks. Was anything unclear?", topic_action: "next_topic", learner_declined: false, offered_to_post_question: false }) };
    });
    const { ctx, interview } = await toConversationAs("farid", "Tool loop");
    const turn = await sendTurn(ctx, { interview_id: interview.id, text: "The guide was useful.", mode: "text" });
    expect(turn.reply.text).toBe("Thanks. Was anything unclear?");
    // The conversation offers no save_rating, raise_question only after an offer, and the final step nothing.
    expect(seen).toEqual([["end_interview", "flag_blocker"], ["end_interview", "flag_blocker"], []]);
  });

  it("doesn't end the interview when the turn that called end_interview failed", async () => {
    overrideStubBrain("interviewer", (call) => (call.toolResults.length ? { text: "not the reply format" } : { toolCalls: [{ name: "end_interview", input: {} }] }));
    const { ctx, interview } = await toConversationAs("chloe", "Failed ending");
    const turn = await sendTurn(ctx, { interview_id: interview.id, text: "The Core Agent settings were hard.", mode: "text" });
    expect(turn.interview.stage).toBe("conversation");
  });

  it("ends early only when the reply also says the learner asked to stop", async () => {
    const reply = (stop: boolean) => JSON.stringify({ reply: "Okay.", topic_action: "stay", learner_declined: false, offered_to_post_question: false, learner_asked_to_stop: stop });
    overrideStubBrain("interviewer", (call) => (call.toolResults.length ? { text: reply(call.lastUser.includes("stop")) } : { toolCalls: [{ name: "end_interview", input: {} }] }));
    const { ctx, interview } = await toConversationAs("elena", "Ending early");
    let turn = await sendTurn(ctx, { interview_id: interview.id, text: "The guide was the most useful part.", mode: "text" });
    expect(turn.interview.stage).toBe("conversation");
    turn = await sendTurn(ctx, { interview_id: interview.id, text: "Can we stop here, please?", mode: "text" });
    expect(turn.interview.stage).toBe("read_back");
  });

  it("drops the follow-up when the turns left are needed for the topics still to ask", async () => {
    // A model that follows up whenever it may. With 6 turns and four topics (no brief, no changes), only code can fit them all in.
    overrideStubBrain("interviewer", (call) => {
      if (call.context.stage === "read_back") return { text: JSON.stringify({ points: ["One", "Two", "Three"] }) };
      const current = call.context.current_topic as { follow_up_available: boolean } | null;
      return { text: JSON.stringify({ reply: "Tell me more?", topic_action: current?.follow_up_available ? "follow_up" : "next_topic", learner_declined: false, offered_to_post_question: false }) };
    });
    const setup: EngineSetup = { kind: "session", guide: DEFAULT_SESSION_GUIDE, brief: null, actions: [], courseTitle: "Course", sessionTitle: "Session", learnerName: null, limits: { maxTurns: 6, maxMinutes: 15 } };
    const deps = { model: languageModel("interviewer"), instructions: "" };
    let state: EngineState = { stage: "consent", progress: initialProgress(setup), turnCount: 0, startedAt: new Date(), ratings: {}, history: [] };
    const consent = await handleLearnerTurn(deps, setup, { ...state, turnCount: 1 }, "Ready", "text", new Date());
    state = { ...state, stage: consent.stage, progress: consent.progress, turnCount: 1 };
    for (const item of DEFAULT_SESSION_GUIDE.rating_items) {
      const r = handleChip(setup, state, item.id, "prefer_not_to_say");
      state = { ...state, stage: r.stage, progress: r.progress, ratings: { ...state.ratings, [item.id]: "prefer_not_to_say" } };
    }
    while (state.stage === "conversation" && state.turnCount < 12) {
      const turnCount = state.turnCount + 1;
      const r = await handleLearnerTurn(deps, setup, { ...state, turnCount }, `Answer ${turnCount}`, "text", new Date());
      state = { ...state, stage: r.stage, progress: r.progress, turnCount };
    }
    expect(state.stage).toBe("read_back");
    expect(state.turnCount).toBeLessThanOrEqual(6);
    expect(state.progress.topics.filter((t) => t.status === "pending")).toEqual([]);
  });

  it("says thanks once when a typed rating leads into the conversation", async () => {
    const s = await openSession("One thanks");
    const ctx = await ctxAs("chloe");
    let { interview } = await startInterview(ctx, { session_id: s.id, anonymity: "anonymous", kind: "session" });
    interview = (await sendTurn(ctx, { interview_id: interview.id, text: "Ready", mode: "text" })).interview;
    let last = "";
    for (const answer of ["Yes, without help", "About right", "Most of it", "8"]) last = (await sendTurn(ctx, { interview_id: interview.id, text: answer, mode: "text" })).reply.text;
    expect(last).toMatch(/^Thanks\. Now a few questions/);
    expect(last).not.toMatch(/Thanks\. Thanks/);
  });

  it("asks which choice is closest when an unclear rating gets a reply with no question", async () => {
    overrideStubBrain("interviewer", () => ({ text: JSON.stringify({ reply: "Thanks, that's clear.", topic_action: "stay", learner_declined: false, offered_to_post_question: false }) }));
    const s = await openSession("Unclear rating");
    const ctx = await ctxAs("diego");
    const { interview } = await startInterview(ctx, { session_id: s.id, anonymity: "anonymous", kind: "session" });
    await sendTurn(ctx, { interview_id: interview.id, text: "Ready", mode: "text" });
    const turn = await sendTurn(ctx, { interview_id: interview.id, text: "Honestly, it depends on the day.", mode: "text" });
    expect(turn.interview.stage).toBe("ratings");
    expect(turn.reply.text).toMatch(/^Thanks\. Which of these is closest: .+\?$/);
  });

  it("can't overwrite a chip rating during the conversation", async () => {
    overrideStubBrain("interviewer", (call) =>
      call.toolResults.length
        ? { text: JSON.stringify({ reply: "Thanks. Was anything unclear?", topic_action: "next_topic", learner_declined: false, offered_to_post_question: false }) }
        : { toolCalls: [{ name: "save_rating", input: { item_id: "pace", choice: "too_fast" } }] },
    );
    const { ctx, interview } = await toConversationAs("diego", "Ratings held");
    await sendTurn(ctx, { interview_id: interview.id, text: "It all felt a bit rushed.", mode: "text" });
    const rows = await sql()`select choice from public.ratings where interview_id = ${interview.id} and item_id = 'pace'`;
    expect(rows).toEqual([{ choice: "prefer_not_to_say" }]);
  });
});
