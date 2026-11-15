import type { Ctx } from "@/lib/server/ctx";
import { requireUser } from "@/lib/server/ctx";
import type { OperationInput } from "@/lib/operations";
import { conflict, forbidden, HttpError, notFound, unprocessable } from "@/lib/server/http";
import { mintVoiceToken, VoiceUnavailable } from "@/lib/server/voice";
import { choicesFor, isValidChoice } from "@/lib/guide";
import type { Json } from "@/lib/database.types";
import { languageModel } from "@/lib/server/ai/models";
import { modelIdFor } from "@/lib/server/ai/provider";
import { loadAgentFile } from "@/lib/server/ai/agent-file";
import { recordRun } from "@/lib/server/ai/runs";
import { enqueue } from "@/lib/server/jobs/queue";
import {
  handleChip,
  handleLearnerTurn,
  hardLimit,
  initialProgress,
  openingMessage,
  ratingItem,
  readBack,
  type EngineResult,
  type EngineSetup,
  type RunRecord,
} from "@/agents/interviewer/engine";
import type { Progress, Stage } from "@/agents/interviewer/schema";
import { STAGE_LABEL } from "@/agents/interviewer/schema";
import { authorizeInterview, hashToken, interviewCookie, newToken, TOKEN_MAX_AGE } from "@/lib/server/interviews/token";
import { loadGuide, loadSetup, loadState, actionsBefore, type InterviewRow } from "@/lib/server/interviews/setup";
import { isEnrolled, kickJobs } from "./common";
import { followUpWindow } from "@/lib/server/follow-up";

export type PublicInterview = {
  id: string;
  kind: "session" | "follow_up";
  anonymity: "named" | "anonymous" | "private";
  state: string;
  stage: Stage;
  stage_label: string;
  turn_count: number;
  max_turns: number;
  pending_rating: { id: string; prompt: string; choices: Array<{ id: string; label: string }> } | null;
  ratings: Record<string, string>;
  rating_items: Array<{ id: string; prompt: string; choices: Array<{ id: string; label: string }> }>;
  summary: string[] | null;
};

export type ChatMessage = { role: "learner" | "interviewer"; text: string; mode: "text" | "voice" | "chip" };

export function publicInterview(iv: InterviewRow, setup: EngineSetup, ratings: Record<string, string>): PublicInterview {
  const progress = iv.progress as unknown as Progress;
  const item = progress.current_item ? ratingItem(setup, progress.current_item) : undefined;
  const items = progress.rating_items.map((id) => ratingItem(setup, id)).filter((x) => x !== undefined);
  return {
    id: iv.id,
    kind: iv.kind,
    anonymity: iv.anonymity,
    state: iv.state,
    stage: iv.stage as Stage,
    stage_label: STAGE_LABEL[iv.stage as Stage],
    turn_count: iv.turn_count,
    max_turns: setup.limits.maxTurns,
    pending_rating: iv.stage === "ratings" && item ? { id: item.id, prompt: item.prompt, choices: choicesFor(item) } : null,
    ratings,
    rating_items: items.map((r) => ({ id: r.id, prompt: r.prompt, choices: choicesFor(r) })),
    summary: progress.proposed_summary,
  };
}

async function writeRuns(ctx: Ctx, iv: InterviewRow, runs: RunRecord[], version: string) {
  for (const r of runs) {
    await recordRun(
      ctx.admin,
      {
        organizationId: iv.organization_id,
        agent: "interviewer",
        agentVersion: version,
        model: modelIdFor("interviewer"),
        operation: r.operation,
        interviewId: iv.id,
        sessionId: iv.session_id,
        // Agent runs carry a learner id only for named interviews.
        learnerId: iv.anonymity === "named" ? iv.participant_id : null,
      },
      { outcome: r.outcome, usage: r.usage, providerMetadata: r.providerMetadata, latencyMs: r.latencyMs, error: r.error },
    );
  }
}

async function appendTurns(ctx: Ctx, iv: InterviewRow, startSeq: number, turns: Array<{ role: "learner" | "interviewer"; text: string; mode: "text" | "voice" | "chip"; stage: Stage; topic: string | null }>) {
  if (!turns.length) return;
  const { error } = await ctx.admin.from("interview_turns").insert(
    turns.map((t, i) => ({ organization_id: iv.organization_id, interview_id: iv.id, seq: startSeq + i + 1, role: t.role, text: t.text, mode: t.mode, stage: t.stage, topic: t.topic })),
  );
  if (error) throw new Error(`append turns: ${error.code}`);
}

/** Starts an interview for an enrolled learner on an open session, and sets its token cookie. */
export async function startInterview(ctx: Ctx, input: OperationInput<"start_interview">) {
  const user = requireUser(ctx);
  const { data: session } = await ctx.db.from("sessions").select("id, organization_id, course_id, number, title, state, date").eq("id", input.session_id).maybeSingle();
  if (!session) throw notFound("Session not found");
  if (!(await isEnrolled(ctx, session.course_id))) throw forbidden("Only learners enrolled in this course can give feedback");

  if (input.kind === "session") {
    if (session.state !== "open") throw conflict("Feedback isn't open for this session");
  } else {
    const window = await followUpWindow(ctx.admin, session.course_id, ctx.now());
    if (!window.open || window.sessionId !== session.id) throw conflict("The follow-up isn't open yet");
  }
  const { data: done } = await ctx.db.from("completions").select("id").eq("session_id", session.id).eq("user_id", user.id).eq("kind", input.kind).maybeSingle();
  if (done) throw conflict("You've already given this feedback. Thank you.");

  const guide = await loadGuide(ctx.admin, session.course_id, input.kind);
  const { data: brief } = await ctx.admin.from("sessions").select("brief, brief_approved_at").eq("id", session.id).single();
  const actions = input.kind === "session" ? await actionsBefore(ctx.admin, session.course_id, session.number) : [];
  const progress = initialProgress({ guide, brief: brief?.brief_approved_at ? (brief.brief as EngineSetup["brief"]) : null, actions });
  const agent = loadAgentFile("interviewer");
  const token = newToken();
  const now = ctx.now().toISOString();

  const { data: iv, error } = await ctx.admin
    .from("interviews")
    .insert({
      organization_id: session.organization_id,
      course_id: session.course_id,
      session_id: session.id,
      kind: input.kind,
      anonymity: input.anonymity,
      participant_id: input.anonymity === "named" ? user.id : null,
      state: "in_progress",
      stage: "consent",
      token_hash: hashToken(token),
      progress: progress as unknown as Json,
      agent_version: agent.version,
      started_at: now,
      last_activity_at: now,
    })
    .select("*")
    .single();
  if (error || !iv) throw new Error(`start interview: ${error?.code}`);
  ctx.cookies.set(interviewCookie(iv.id), token, { maxAge: TOKEN_MAX_AGE, path: "/" });

  const opening = openingMessage(`Session ${session.number}: ${session.title}`, input.anonymity, input.kind);
  await appendTurns(ctx, iv, 0, [{ role: "interviewer", text: opening, mode: "text", stage: "consent", topic: null }]);
  const setup = await loadSetup(ctx.admin, iv);
  return { interview: publicInterview(iv, setup, {}), messages: [{ role: "interviewer", text: opening, mode: "text" }] as ChatMessage[] };
}

async function applyEffects(ctx: Ctx, iv: InterviewRow, result: EngineResult) {
  for (const e of result.effects) {
    if (e.type === "raise_question") {
      let authorName: string | null = null;
      if (iv.anonymity === "named" && iv.participant_id) {
        const { data } = await ctx.admin.from("enrollments").select("display_name").eq("course_id", iv.course_id).eq("user_id", iv.participant_id).maybeSingle();
        authorName = data?.display_name ?? null;
      }
      const { data: q } = await ctx.admin
        .from("questions")
        .insert({
          organization_id: iv.organization_id,
          course_id: iv.course_id,
          session_id: iv.session_id,
          author_id: iv.anonymity === "named" ? iv.participant_id : null,
          author_name: iv.anonymity === "named" ? authorName : null,
          text: e.text,
          state: "open",
          origin: "interview",
        })
        .select("id")
        .single();
      if (q) await enqueue(ctx.admin, { kind: "answer_question", payload: { question_id: q.id }, organizationId: iv.organization_id });
    } else if (e.type === "flag_blocker") {
      await enqueue(ctx.admin, {
        kind: "notify_blocker",
        payload: { session_id: iv.session_id, summary: e.summary },
        organizationId: iv.organization_id,
      });
    }
  }
}

/** Adds the learner's turn and returns the Interviewer's reply. */
export async function sendTurn(ctx: Ctx, input: OperationInput<"send_turn">) {
  const iv = await authorizeInterview(ctx, input.interview_id);
  if (iv.state !== "in_progress") throw conflict("This interview has already been submitted");
  const setup = await loadSetup(ctx.admin, iv);
  const state = await loadState(ctx.admin, iv);
  const turnCount = iv.turn_count + 1;
  if (turnCount > hardLimit(setup)) throw conflict("This interview has reached its limit. Check the summary and submit it.");

  const agent = loadAgentFile("interviewer");
  const result = await handleLearnerTurn(
    { model: languageModel("interviewer"), instructions: agent.instructions },
    setup,
    { ...state, turnCount },
    input.text,
    input.mode,
    ctx.now(),
  );

  const topic = state.progress.current_topic ?? state.progress.current_item;
  await appendTurns(ctx, iv, state.lastSeq, [
    { role: "learner", text: input.text, mode: input.mode, stage: state.stage, topic },
    { role: "interviewer", text: result.reply, mode: "text", stage: result.stage, topic: result.progress.current_topic ?? result.progress.current_item },
  ]);
  for (const r of result.ratingsToSave) await upsertRating(ctx, iv, r.item_id, r.choice);
  const { data: updated, error } = await ctx.admin
    .from("interviews")
    .update({ stage: result.stage, progress: result.progress as unknown as Json, turn_count: turnCount, last_activity_at: ctx.now().toISOString() })
    .eq("id", iv.id)
    .eq("state", "in_progress")
    .select("*")
    .single();
  if (error || !updated) throw conflict("This interview changed in another window. Reload the page.");
  await applyEffects(ctx, iv, result);
  await writeRuns(ctx, iv, result.runs, agent.version);
  if (result.effects.length) kickJobs(ctx);
  const ratings = { ...state.ratings, ...Object.fromEntries(result.ratingsToSave.map((r) => [r.item_id, r.choice])) };
  return { reply: { role: "interviewer", text: result.reply, mode: "text" } as ChatMessage, interview: publicInterview(updated, setup, ratings) };
}

async function upsertRating(ctx: Ctx, iv: InterviewRow, itemId: string, choice: string) {
  const { error } = await ctx.admin.from("ratings").upsert(
    {
      organization_id: iv.organization_id,
      course_id: iv.course_id,
      session_id: iv.session_id,
      interview_id: iv.id,
      kind: iv.kind,
      item_id: itemId,
      choice,
      updated_at: ctx.now().toISOString(),
    },
    { onConflict: "interview_id,item_id" },
  );
  if (error) throw new Error(`save rating: ${error.code}`);
}

/** Saves one rating. A chip tap goes through here and never calls the model. */
export async function saveRating(ctx: Ctx, input: OperationInput<"save_rating">) {
  const iv = await authorizeInterview(ctx, input.interview_id);
  if (iv.state !== "in_progress") throw conflict("This interview has already been submitted");
  const setup = await loadSetup(ctx.admin, iv);
  const item = ratingItem(setup, input.item_id);
  if (!item || !(iv.progress as unknown as Progress).rating_items.includes(item.id)) throw unprocessable("That rating item isn't part of this interview");
  if (!isValidChoice(item, input.choice)) throw unprocessable("That isn't one of the choices");
  const state = await loadState(ctx.admin, iv);
  await upsertRating(ctx, iv, item.id, input.choice);
  const ratings = { ...state.ratings, [item.id]: input.choice };

  const step = handleChip(setup, state, item.id, input.choice);
  const label = [...item.choices, { id: "prefer_not_to_say", label: "Prefer not to say" }].find((c) => c.id === input.choice)!.label;
  let reply: string | null = step.reply;
  let stage = step.stage;
  const progress = step.progress;
  if (step.needsReadBack) {
    const runs: RunRecord[] = [];
    const agent = loadAgentFile("interviewer");
    progress.proposed_summary = await readBack({ model: languageModel("interviewer"), instructions: agent.instructions }, setup, state.history, null, null, runs);
    stage = "read_back";
    progress.read_back_turn ??= iv.turn_count;
    reply = `Here's what I heard: ${progress.proposed_summary.join(" ")}`;
    await writeRuns(ctx, iv, runs, agent.version);
  }
  const chipTurns: Parameters<typeof appendTurns>[3] = [];
  if (state.stage === "ratings" && state.progress.current_item === item.id) {
    chipTurns.push({ role: "learner", text: label, mode: "chip", stage: "ratings", topic: item.id });
    if (reply) chipTurns.push({ role: "interviewer", text: reply, mode: "text", stage, topic: progress.current_topic ?? progress.current_item });
  }
  await appendTurns(ctx, iv, state.lastSeq, chipTurns);
  const { data: updated } = await ctx.admin
    .from("interviews")
    .update({ stage, progress: progress as unknown as Json, last_activity_at: ctx.now().toISOString() })
    .eq("id", iv.id)
    .select("*")
    .single();
  return {
    reply: reply ? ({ role: "interviewer", text: reply, mode: "text" } as ChatMessage) : null,
    interview: publicInterview(updated ?? iv, setup, ratings),
  };
}

const dateOnly = (d: Date) => `${d.toISOString().slice(0, 10)}T00:00:00Z`;

/**
 * Submits the interview. The completion is written as its own row, with a date and no time and
 * nothing pointing at the interview. Anonymous and private interviews lose their learner link
 * and every timestamp is cut to the date.
 */
export async function submitInterview(ctx: Ctx, input: OperationInput<"submit_interview">) {
  const iv = await authorizeInterview(ctx, input.interview_id);
  const user = requireUser(ctx);
  if (iv.state !== "in_progress") throw conflict("This interview has already been submitted");
  if (!(await isEnrolled(ctx, iv.course_id))) throw forbidden("Only learners enrolled in this course can give feedback");
  const progress = iv.progress as unknown as Progress;
  const { data: ratings } = await ctx.admin.from("ratings").select("item_id").eq("interview_id", iv.id);
  const answered = new Set((ratings ?? []).map((r) => r.item_id));
  const missing = progress.rating_items.filter((id) => !answered.has(id));
  if (missing.length) throw unprocessable("Answer every rating, or choose “Prefer not to say”", { missing });

  const now = ctx.now();
  const { error: completionError } = await ctx.admin.from("completions").insert({
    organization_id: iv.organization_id,
    course_id: iv.course_id,
    session_id: iv.session_id,
    user_id: user.id,
    kind: iv.kind,
    completed_on: now.toISOString().slice(0, 10),
  });
  if (completionError) {
    if (completionError.code === "23505") throw conflict("You've already given this feedback. Thank you.");
    throw new Error(`completion: ${completionError.code}`);
  }

  const named = input.anonymity === "named";
  const edited = JSON.stringify(input.summary) !== JSON.stringify(progress.proposed_summary ?? []);
  const { error } = await ctx.admin
    .from("interviews")
    .update({
      state: "submitted",
      stage: "done",
      anonymity: input.anonymity,
      participant_id: named ? user.id : null,
      summary: input.summary,
      summary_edited: edited,
      submitted_at: named ? now.toISOString() : dateOnly(now),
      ...(named ? { last_activity_at: now.toISOString() } : { started_at: dateOnly(new Date(iv.started_at)), last_activity_at: dateOnly(now) }),
    })
    .eq("id", iv.id)
    .eq("state", "in_progress");
  if (error) {
    await ctx.admin.from("completions").delete().eq("session_id", iv.session_id).eq("user_id", user.id).eq("kind", iv.kind);
    throw new Error(`submit: ${error.code}`);
  }
  if (!named) await ctx.admin.from("interview_turns").update({ created_at: dateOnly(now) }).eq("interview_id", iv.id);
  if (!named) await ctx.admin.from("ratings").update({ created_at: dateOnly(now), updated_at: dateOnly(now) }).eq("interview_id", iv.id);
  await enqueue(ctx.admin, { kind: "analyse_interview", payload: { interview_id: iv.id }, organizationId: iv.organization_id });
  kickJobs(ctx);
  return { submitted: true, anonymity: input.anonymity };
}

/** The learner's one-tap rating of the interview itself. */
export async function rateInterview(ctx: Ctx, interviewId: string, rating: "helpful" | "okay" | "not_helpful") {
  const iv = await authorizeInterview(ctx, interviewId);
  if (iv.state === "in_progress" || iv.interview_rating) throw conflict("Already rated");
  await ctx.admin.from("interviews").update({ interview_rating: rating }).eq("id", iv.id);
  ctx.cookies.delete(interviewCookie(iv.id));
  return { rated: true };
}

/** The current interview in this browser for a session, if there is one. */
export async function resumeInterview(ctx: Ctx, interviewIds: string[], sessionId: string, kind: "session" | "follow_up") {
  for (const id of interviewIds) {
    let iv: InterviewRow;
    try {
      iv = await authorizeInterview(ctx, id);
    } catch {
      continue;
    }
    if (iv.session_id !== sessionId || iv.kind !== kind) continue;
    if (iv.state === "in_progress" || !iv.interview_rating) {
      const setup = await loadSetup(ctx.admin, iv);
      const state = await loadState(ctx.admin, iv);
      const { data: turns } = await ctx.admin.from("interview_turns").select("role, text, mode").eq("interview_id", iv.id).order("seq");
      return {
        interview: publicInterview(iv, setup, state.ratings),
        messages: (turns ?? []) as ChatMessage[],
      };
    }
  }
  return null;
}

/**
 * Mints a short-lived Vocal Bridge token for an interview in progress. The name sent to Vocal
 * Bridge is "Learner" for anonymous and private interviews.
 */
export async function getVoiceToken(ctx: Ctx, input: OperationInput<"get_voice_token">, fetcher: typeof fetch = fetch) {
  const iv = await authorizeInterview(ctx, input.interview_id);
  if (iv.state !== "in_progress") throw conflict("This interview has already been submitted");
  let participant = "Learner";
  if (iv.anonymity === "named" && iv.participant_id) {
    const { data } = await ctx.admin.from("enrollments").select("display_name").eq("course_id", iv.course_id).eq("user_id", iv.participant_id).maybeSingle();
    participant = data?.display_name.split(" ")[0] ?? "Learner";
  }
  try {
    return await mintVoiceToken(participant, iv.id, fetcher);
  } catch (err) {
    if (err instanceof VoiceUnavailable) {
      // The reason only (a timeout, a status code): never anything the learner said.
      console.warn(`[voice-token] ${err.message}`);
      throw new HttpError(502, "Voice isn't available right now. You can keep typing.");
    }
    throw err;
  }
}
