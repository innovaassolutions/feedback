import { generateText, isStepCount, Output, type ModelMessage } from "ai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { choicesFor, isValidChoice, PREFER_NOT_TO_SAY, type GuidePart, type RatingItem, type Topic } from "@/lib/guide";
import { errorName } from "@/lib/server/ai/runs";
import { interviewerTools, type ToolEffect } from "./tools";
import { readBackSchema, turnOutputSchema, type Progress, type ReadBackOutput, type Stage, type TurnOutput } from "./schema";

// The Interviewer, as code and model together. Code decides the stage, counts turns and time,
// tracks topics and checks every tool effect. The model writes the questions and follow-ups.

export type Brief = { objectives: string[]; topics: string[]; known_issues: string[] };
export type ActionItem = { you_said: string; we_did: string };
export type Turn = { role: "learner" | "interviewer"; text: string; stage: Stage };

export type EngineSetup = {
  kind: "session" | "follow_up";
  guide: GuidePart;
  brief: Brief | null;
  actions: ActionItem[];
  courseTitle: string;
  sessionTitle: string;
  /** Only for named interviews. Never set for anonymous or private ones. */
  learnerName: string | null;
  limits: { maxTurns: number; maxMinutes: number };
};

export type EngineState = {
  stage: Stage;
  progress: Progress;
  /** Learner turns so far, including the one being handled. */
  turnCount: number;
  startedAt: Date;
  ratings: Record<string, string>;
  history: Turn[];
};

export type RunRecord = {
  operation: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  providerMetadata?: unknown;
  latencyMs: number;
  outcome: "ok" | "validation_failed" | "error";
  error?: string;
};

export type EngineResult = {
  reply: string;
  stage: Stage;
  progress: Progress;
  ratingsToSave: Array<{ item_id: string; choice: string }>;
  effects: ToolEffect[];
  /** Effects the model asked for that code refused, for the quality record. */
  refused: ToolEffect[];
  runs: RunRecord[];
};

export function initialProgress(setup: Pick<EngineSetup, "guide" | "brief" | "actions">): Progress {
  const topics = setup.guide.topics
    .filter((t) => (t.id === "brief_question" ? Boolean(setup.brief?.topics.length || setup.brief?.known_issues.length) : true))
    .filter((t) => (t.id === "last_changes" ? setup.actions.length > 0 : true))
    .map((t) => ({ id: t.id, status: "pending" as const }));
  return {
    rating_items: setup.guide.rating_items.map((r) => r.id),
    current_item: null,
    clarified: [],
    topics,
    current_topic: null,
    last_offer: false,
    proposed_summary: null,
    blockers_flagged: 0,
    questions_raised: 0,
    read_back_turn: null,
  };
}

const LEVEL_TEXT = {
  named: "Named: your instructor sees your name with your answers",
  anonymous: "Anonymous: your instructor sees your answers without your name or the time",
  private: "Private: only a summary is kept, and your words are deleted once they've been analysed",
} as const;

export function openingMessage(sessionTitle: string, anonymity: keyof typeof LEVEL_TEXT, kind: "session" | "follow_up"): string {
  const what = kind === "follow_up" ? "a short follow-up on how the course has helped at work" : `feedback on ${sessionTitle}`;
  return `Thanks for giving ${what}. It takes five to eight minutes. You chose ${LEVEL_TEXT[anonymity]}. You can change that on the summary screen before you submit. Tell me when you are ready to start.`;
}

export function ratingItem(setup: EngineSetup, id: string): RatingItem | undefined {
  return setup.guide.rating_items.find((r) => r.id === id);
}

export function ratingPrompt(item: RatingItem, spoken: boolean): string {
  if (!spoken) return item.prompt;
  return `${item.prompt} ${spokenChoices(item)}`;
}

/**
 * The choices read aloud for learners who may speak English as a second language. Each is its own
 * short sentence, because the voice pauses at a full stop and ran a comma-separated list together at
 * over 200 words a minute. A 0 to 10 scale is read as its range, not as eleven numbers.
 */
export function spokenChoices(item: RatingItem): string {
  const labels = item.choices.map((c) => c.label);
  const numbers = labels.map(Number);
  const scale = labels.length > 2 && numbers.every((n, i) => Number.isInteger(n) && (i === 0 || n === numbers[i - 1] + 1));
  const options = scale ? [`a number from ${labels[0]} to ${labels[labels.length - 1]}`] : labels;
  return `You can say: ${options.join(". ")}. Or prefer not to say.`;
}

function topicOf(setup: EngineSetup, id: string | null): Topic | undefined {
  return id ? setup.guide.topics.find((t) => t.id === id) : undefined;
}

function openerFor(setup: EngineSetup, topic: Topic): string {
  const briefTopic = setup.brief?.topics[0] ?? setup.brief?.known_issues[0] ?? "the session";
  return topic.opener.replace("{topic}", briefTopic);
}

function clone(p: Progress): Progress {
  return JSON.parse(JSON.stringify(p));
}

function nextPendingTopic(progress: Progress): string | null {
  return progress.topics.find((t) => t.status === "pending")?.id ?? null;
}

function setTopicStatus(progress: Progress, id: string | null, status: Progress["topics"][number]["status"]) {
  const t = progress.topics.find((x) => x.id === id);
  if (t) t.status = status;
}

function toMessages(history: Turn[], learnerText: string): ModelMessage[] {
  const messages: ModelMessage[] = history.map((t) =>
    t.role === "learner" ? { role: "user", content: t.text } : { role: "assistant", content: t.text },
  );
  messages.push({ role: "user", content: learnerText });
  return messages;
}

function contextBlock(setup: EngineSetup, extra: Record<string, unknown>): string {
  const context = {
    course: setup.courseTitle,
    session: setup.sessionTitle,
    kind: setup.kind,
    brief: setup.brief,
    // Feedback from the group, not from this learner: "you_said" led the model to tell learners
    // "last time you said…" about things they never said.
    changes_since_last_session: setup.actions.map((a) => ({ feedback_from_learners: a.you_said, what_changed: a.we_did })),
    learner_name: setup.learnerName,
    ...extra,
  };
  return `\n\n## Context for this turn\n<context>${JSON.stringify(context)}</context>`;
}

type ModelDeps = { model: LanguageModelV4; instructions: string };

type ToolName = keyof ReturnType<typeof interviewerTools>;

/**
 * The tools a turn offers. Ratings are saved only while they're being asked, and raise_question
 * is offered only on the turn after the Interviewer offered to post a question.
 */
function turnTools(stage: Stage, progress: Progress): ToolName[] {
  if (stage === "ratings") return ["save_rating", "flag_blocker", "end_interview"];
  return progress.last_offer ? ["raise_question", "flag_blocker", "end_interview"] : ["flag_blocker", "end_interview"];
}

/** A blocker summary that describes nothing. */
const PLACEHOLDER = /^\s*(placeholder|tbd|todo|n\/?a|none|test|blocker|summary)\W*$/i;

/** Tool steps before the model must answer. The last step offers no tools, so a turn always ends in a reply. */
const TURN_STEPS = 3;

async function modelTurn(
  deps: ModelDeps,
  setup: EngineSetup,
  state: EngineState,
  learnerText: string,
  extra: Record<string, unknown>,
  runs: RunRecord[],
): Promise<{ output: TurnOutput | null; effects: ToolEffect[] }> {
  const effects: ToolEffect[] = [];
  const started = performance.now();
  const stageTools = turnTools(state.stage, state.progress);
  try {
    const result = await generateText({
      model: deps.model,
      instructions: deps.instructions + contextBlock(setup, extra),
      messages: toMessages(state.history, learnerText),
      tools: interviewerTools(effects),
      activeTools: [...stageTools],
      prepareStep: ({ stepNumber }) => (stepNumber >= TURN_STEPS - 1 ? { activeTools: [] } : {}),
      output: Output.object({ schema: turnOutputSchema }),
      stopWhen: isStepCount(TURN_STEPS),
      maxOutputTokens: 600,
    });
    const output = turnOutputSchema.parse(result.output);
    runs.push({ operation: `turn:${state.stage}`, usage: result.totalUsage, providerMetadata: result.providerMetadata, latencyMs: performance.now() - started, outcome: "ok" });
    return { output, effects };
  } catch (err) {
    runs.push({ operation: `turn:${state.stage}`, latencyMs: performance.now() - started, outcome: "validation_failed", error: errorName(err) });
    return { output: null, effects };
  }
}

/** Writes the read-back, or (with the learner's reply to it) revises it. Null when the model's output fails. */
async function readBackCall(deps: ModelDeps, setup: EngineSetup, history: Turn[], learnerReply: string | null, previous: string[] | null, runs: RunRecord[]): Promise<ReadBackOutput | null> {
  const started = performance.now();
  const transcript = history.filter((t) => t.stage === "conversation" || t.stage === "read_back");
  try {
    const result = await generateText({
      model: deps.model,
      instructions: deps.instructions + contextBlock(setup, { stage: "read_back", previous_summary: previous, learner_reply: learnerReply }),
      // The learner's words go in as a reply to the summary, not as "update the summary": a request
      // to start again used to be folded into the points as if it were a correction.
      messages: toMessages(transcript, learnerReply ? `My reply to the summary: ${learnerReply}` : "Please summarise what you heard in three to five points."),
      output: Output.object({ schema: readBackSchema }),
      maxOutputTokens: 700,
    });
    const out = readBackSchema.parse(result.output);
    runs.push({ operation: "read_back", usage: result.totalUsage, providerMetadata: result.providerMetadata, latencyMs: performance.now() - started, outcome: "ok" });
    return out;
  } catch (err) {
    runs.push({ operation: "read_back", latencyMs: performance.now() - started, outcome: "validation_failed", error: errorName(err) });
    return null;
  }
}

/**
 * The summary when the learner said nothing in the conversation. Asked to summarise nothing, a model
 * wrote points about the interview itself ("You asked to stop the interview…").
 */
export const NOTHING_TO_SUMMARISE = "No comments beyond the ratings.";
const NOTHING_SAID = "You didn't add anything beyond the ratings, so the summary on your screen just says that. Add anything you'd like there, then submit.";

function saidInConversation(history: Turn[]): boolean {
  return history.some((t) => t.role === "learner" && t.stage === "conversation");
}

export async function readBack(deps: ModelDeps, setup: EngineSetup, history: Turn[], runs: RunRecord[]): Promise<string[]> {
  if (!saidInConversation(history)) return [NOTHING_TO_SUMMARISE];
  const out = await readBackCall(deps, setup, history, null, null, runs);
  // A plain fallback the learner can edit, so the interview can still be submitted.
  return out?.points ?? ["Thanks for your feedback. Add or edit points here before you submit."];
}

/** The answer to anything at the read-back that isn't a correction, when the model gives none. */
export const ON_SCREEN_HELP = "You can change or remove any point on the summary screen, then submit.";
const COULD_NOT_UPDATE = "Sorry, I couldn't change that. You can edit the points on the summary screen, then submit.";

/** The reply to a spoken correction at the read-back. */
export const UPDATED_ON_SCREEN = "I've updated the summary on your screen. Change anything that's still wrong there, then submit.";

function readBackReply(points: string[]): string {
  return `Here's what I heard. ${points.map((p, i) => `${i + 1}. ${p}`).join(" ")} Check these on the summary screen, change anything that's wrong, then submit.`;
}

/** The limits come first: at max_turns or max_minutes the interview moves to the read-back. */
export function limitReached(setup: EngineSetup, state: EngineState, now: Date): boolean {
  const minutes = (now.getTime() - state.startedAt.getTime()) / 60_000;
  return state.turnCount >= setup.limits.maxTurns || minutes >= setup.limits.maxMinutes;
}

export function hardLimit(setup: EngineSetup): number {
  return setup.limits.maxTurns + 4;
}

/** Moves the ratings stage on to the next unanswered item, or into the conversation. */
export function advanceRatings(setup: EngineSetup, progress: Progress, ratings: Record<string, string>, spoken: boolean): { stage: Stage; prompt: string } {
  const next = progress.rating_items.find((id) => !(id in ratings));
  if (next) {
    progress.current_item = next;
    return { stage: "ratings", prompt: ratingPrompt(ratingItem(setup, next)!, spoken) };
  }
  progress.current_item = null;
  const first = nextPendingTopic(progress);
  if (!first) return { stage: "read_back", prompt: "" };
  progress.current_topic = first;
  setTopicStatus(progress, first, "asked");
  return { stage: "conversation", prompt: openerFor(setup, topicOf(setup, first)!) };
}

export async function handleLearnerTurn(
  deps: ModelDeps,
  setup: EngineSetup,
  state: EngineState,
  learnerText: string,
  mode: "text" | "voice",
  now: Date,
): Promise<EngineResult> {
  const progress = clone(state.progress);
  const runs: RunRecord[] = [];
  const effects: ToolEffect[] = [];
  const refused: ToolEffect[] = [];
  const ratingsToSave: Array<{ item_id: string; choice: string }> = [];
  const ratings = { ...state.ratings };
  const spoken = mode === "voice";

  // A blocker alerts the instructor at once: at most one per turn and three per interview.
  // It also needs the reply to say the learner is blocked, and a real description: a model called
  // flag_blocker({ summary: "placeholder" }) for a problem the learner had already got past.
  const acceptBlocker = (e: ToolEffect, output: TurnOutput | null) => {
    const flaggedThisTurn = effects.some((x) => x.type === "flag_blocker");
    const described = e.type === "flag_blocker" && !PLACEHOLDER.test(e.summary);
    if (output?.learner_is_blocked && described && !flaggedThisTurn && progress.blockers_flagged < 3) {
      effects.push(e);
      progress.blockers_flagged++;
    } else refused.push(e);
  };
  // Ending early needs the tool call and a valid reply that says the learner asked to stop. A real
  // model called end_interview after ordinary answers; a failed turn never ends the interview.
  const acceptEnding = (e: ToolEffect, output: TurnOutput | null) => {
    if (output?.learner_asked_to_stop) effects.push(e);
    else refused.push(e);
  };

  // `stopping`: this turn asked to stop, which isn't feedback to summarise.
  const toReadBack = async (lead: string, stopping = false): Promise<EngineResult> => {
    const history = [...state.history, { role: "learner" as const, text: learnerText, stage: state.stage }];
    const said = saidInConversation(stopping ? state.history : history);
    const points = said ? await readBack(deps, setup, history, runs) : [NOTHING_TO_SUMMARISE];
    progress.proposed_summary = points;
    progress.current_topic = null;
    progress.current_item = null;
    progress.read_back_turn ??= state.turnCount;
    const reply = `${lead}${lead ? " " : ""}${said ? readBackReply(points) : NOTHING_SAID}`;
    return { reply, stage: "read_back", progress, ratingsToSave, effects, refused, runs };
  };

  // Consent: the learner chose their level on the consent screen; their first turn starts the interview.
  if (state.stage === "consent") {
    const first = progress.rating_items[0];
    progress.current_item = first ?? null;
    if (!first) {
      const step = advanceRatings(setup, progress, ratings, spoken);
      return { reply: step.prompt, stage: step.stage, progress, ratingsToSave, effects, refused, runs };
    }
    return { reply: ratingPrompt(ratingItem(setup, first)!, spoken), stage: "ratings", progress, ratingsToSave, effects, refused, runs };
  }

  if (state.stage === "read_back") {
    const out = await readBackCall(deps, setup, state.history, learnerText, progress.proposed_summary, runs);
    if (!out) return { reply: COULD_NOT_UPDATE, stage: "read_back", progress, ratingsToSave, effects, refused, runs };
    // Not a correction (a question, "can we start again?"): the summary stays exactly as it was.
    if (out.request === "other") return { reply: out.reply?.trim() || ON_SCREEN_HELP, stage: "read_back", progress, ratingsToSave, effects, refused, runs };
    const points = out.points;
    progress.proposed_summary = points;
    // Spoken, the whole summary after every correction took half a minute each time; it's on screen.
    const reply = spoken ? UPDATED_ON_SCREEN : `I've updated the summary. ${readBackReply(points)}`;
    return { reply, stage: "read_back", progress, ratingsToSave, effects, refused, runs };
  }

  if (limitReached(setup, state, now)) {
    return toReadBack("We're at time, so let's wrap up.");
  }

  if (state.stage === "ratings") {
    const item = ratingItem(setup, progress.current_item ?? "");
    if (!item) {
      const step = advanceRatings(setup, progress, ratings, spoken);
      return { reply: step.prompt, stage: step.stage, progress, ratingsToSave, effects, refused, runs };
    }
    const { output, effects: asked } = await modelTurn(deps, setup, { ...state, progress }, learnerText, {
      stage: "ratings",
      item: { id: item.id, prompt: item.prompt, choices: choicesFor(item) },
      already_clarified: progress.clarified.includes(item.id),
    }, runs);
    let saved = false;
    let ending = false;
    // A learner who didn't understand the question hasn't answered it: a real model saved
    // "prefer not to say" from "your questions are very confusing".
    const explaining = output?.learner_asked_to_explain === true;
    for (const e of asked) {
      if (e.type === "save_rating") {
        const target = ratingItem(setup, e.item_id);
        if (target && isValidChoice(target, e.choice) && !explaining) {
          ratings[e.item_id] = e.choice;
          ratingsToSave.push({ item_id: e.item_id, choice: e.choice });
          if (e.item_id === item.id) saved = true;
        } else refused.push(e);
      } else if (e.type === "flag_blocker") {
        acceptBlocker(e, output);
      } else if (e.type === "end_interview") {
        acceptEnding(e, output);
        ending ||= effects.includes(e);
      } else refused.push(e);
    }
    if (ending) return toReadBack("Okay, let's stop there.", true);
    if (!saved) {
      // "I don't understand the question" gets an explanation, once per item, without using up the
      // item's clarification. It used to count as a second unclear answer and skip the item.
      const explained = progress.explained ?? [];
      if (explaining && !explained.includes(item.id)) {
        progress.explained = [...explained, item.id];
        const reply = output.reply.includes("?") ? output.reply : `Sorry, I'll ask it another way. ${ratingPrompt(item, spoken)}`;
        return { reply, stage: "ratings", progress, ratingsToSave, effects, refused, runs };
      }
      if (!progress.clarified.includes(item.id)) {
        progress.clarified.push(item.id);
        const choices = choicesFor(item).map((c) => c.label).join(", ");
        // The clarification must ask: a model reply without a question ("Thanks, that's clear.") left the
        // rating unsaved and the learner with nothing to answer.
        const fallback = spoken ? `Thanks. Which of these is closest? ${spokenChoices(item)}` : `Thanks. Which of these is closest: ${choices}?`;
        const reply = output?.reply.includes("?") ? output.reply : fallback;
        return { reply, stage: "ratings", progress, ratingsToSave, effects, refused, runs };
      }
      // Asked once already: record it as skipped rather than push the learner.
      ratings[item.id] = PREFER_NOT_TO_SAY;
      ratingsToSave.push({ item_id: item.id, choice: PREFER_NOT_TO_SAY });
      const step = advanceRatings(setup, progress, ratings, spoken);
      if (step.stage === "read_back") return toReadBack("No problem, let's move on.");
      return { reply: `No problem, let's move on. ${step.prompt}`, stage: step.stage, progress, ratingsToSave, effects, refused, runs };
    }
    const step = advanceRatings(setup, progress, ratings, spoken);
    if (step.stage === "read_back") return toReadBack("Thanks.");
    // The first topic's opener already starts with thanks.
    return { reply: /^thanks\b/i.test(step.prompt) ? step.prompt : `Thanks. ${step.prompt}`, stage: step.stage, progress, ratingsToSave, effects, refused, runs };
  }

  // Conversation.
  const current = topicOf(setup, progress.current_topic);
  const currentState = progress.topics.find((t) => t.id === progress.current_topic);
  // One follow-up per topic, and only while the turns left can still reach every pending topic.
  const pendingAfterThis = progress.topics.filter((t) => t.status === "pending" && t.id !== progress.current_topic).length;
  const roomForFollowUp = setup.limits.maxTurns - state.turnCount > pendingAfterThis;
  const followUpAvailable = currentState?.status === "asked" && roomForFollowUp;
  const nextId = progress.topics.find((t) => t.status === "pending" && t.id !== progress.current_topic)?.id ?? null;
  const next = topicOf(setup, nextId);
  const { output, effects: asked } = await modelTurn(deps, setup, { ...state, progress }, learnerText, {
    stage: "conversation",
    current_topic: current ? { id: current.id, label: current.label, goal: current.goal, follow_up_available: followUpAvailable } : null,
    next_topic: next ? { id: next.id, label: next.label, goal: next.goal, suggested_opener: openerFor(setup, next) } : null,
    you_offered_to_post_a_question_last_turn: progress.last_offer,
  }, runs);

  let ending = false;
  // A model can ask to post the same question twice in one turn (again after the first call
  // succeeds), or post it again on a later turn. Code allows one per turn, and never the same one twice.
  const posted = new Set(progress.posted_questions ?? []);
  let postedThisTurn = false;
  for (const e of asked) {
    if (e.type === "raise_question") {
      const key = e.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      // Code holds the consent rule: only if the previous turn offered and this is the reply.
      if (progress.last_offer && progress.questions_raised < 3 && !postedThisTurn && !posted.has(key)) {
        effects.push(e);
        progress.questions_raised++;
        posted.add(key);
        progress.posted_questions = [...posted];
        postedThisTurn = true;
      } else refused.push(e);
    } else if (e.type === "flag_blocker") {
      acceptBlocker(e, output);
    } else if (e.type === "end_interview") {
      acceptEnding(e, output);
      ending ||= effects.includes(e);
    } else {
      // Ratings are saved only in the ratings stage, so the learner's chip answers can't be overwritten.
      refused.push(e);
    }
  }
  if (ending) return toReadBack("Okay, let's stop there.", true);

  if (!output) {
    // The model's output failed validation: keep the interview moving with the next opener.
    setTopicStatus(progress, progress.current_topic, "covered");
    progress.last_offer = false;
    if (!next) return toReadBack("Thank you.");
    progress.current_topic = next.id;
    setTopicStatus(progress, next.id, "asked");
    return { reply: openerFor(setup, next), stage: "conversation", progress, ratingsToSave, effects, refused, runs };
  }

  progress.last_offer = output.offered_to_post_question;
  let action = output.topic_action;
  if (output.learner_declined) {
    setTopicStatus(progress, progress.current_topic, "skipped");
    action = "next_topic";
  } else if (action === "follow_up" && !followUpAvailable) {
    action = "next_topic"; // one follow-up per topic, held in code
  }

  if (action === "stay") return { reply: output.reply, stage: "conversation", progress, ratingsToSave, effects, refused, runs };
  if (action === "follow_up") {
    setTopicStatus(progress, progress.current_topic, "followed_up");
    return { reply: output.reply, stage: "conversation", progress, ratingsToSave, effects, refused, runs };
  }

  if (!output.learner_declined) setTopicStatus(progress, progress.current_topic, "covered");
  if (!next) return toReadBack(output.reply.replace(/\?[^?]*$/, "").trim() || "Thank you.");
  progress.current_topic = next.id;
  setTopicStatus(progress, next.id, "asked");
  // If the model ignored the rule and asked a follow-up anyway, use the next topic's opener.
  const reply = output.topic_action === "follow_up" && !output.learner_declined ? openerFor(setup, next) : output.reply;
  return { reply, stage: "conversation", progress, ratingsToSave, effects, refused, runs };
}

/** A chip tap: saves a rating without calling the model and moves the ratings stage on. */
export function handleChip(setup: EngineSetup, state: EngineState, itemId: string, choice: string): { reply: string | null; stage: Stage; progress: Progress; needsReadBack: boolean } {
  const progress = clone(state.progress);
  const ratings = { ...state.ratings, [itemId]: choice };
  if (state.stage !== "ratings" || progress.current_item !== itemId) return { reply: null, stage: state.stage, progress, needsReadBack: false };
  const step = advanceRatings(setup, progress, ratings, false);
  if (step.stage === "read_back") return { reply: null, stage: "ratings", progress, needsReadBack: true };
  return { reply: step.prompt, stage: step.stage, progress, needsReadBack: false };
}

export function coveredOrSkipped(progress: Progress): boolean {
  return progress.topics.every((t) => t.status === "covered" || t.status === "skipped" || t.status === "followed_up");
}
