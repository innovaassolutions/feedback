import type { Ctx } from "@/lib/server/ctx";
import type { OperationInput } from "@/lib/operations";
import { forbidden, notFound } from "@/lib/server/http";
import {
  ableToApply,
  appliedAtWork,
  netPromoterScore,
  paceAboutRight,
  recommend,
  responseRate,
  spread,
  themeMentions,
  type Fraction,
  type RatingRow,
  type RecommendSummary,
  type ThemeRow,
} from "@/lib/metrics";
import { DEFAULT_SESSION_GUIDE } from "@/lib/guide";
import { canReadResults, isInstructor, readsCourseDetail, sessionForUser } from "./common";
import { sealRef } from "@/lib/server/refs";

type RawResults = {
  responses: number;
  enrolled: number;
  min_group_size: number;
  hidden: boolean;
  ratings?: RatingRow[];
  themes?: ThemeRow[];
  blockers?: string[];
  suggestions?: string[];
  quotes?: Array<{ text: string; theme: string }> | null;
  summary?: string | null;
  summary_source?: string | null;
};

export type SessionResults = {
  session: { id: string; number: number; title: string; state: string };
  kind: "session" | "follow_up";
  responses: number;
  enrolled: number;
  min_group_size: number;
  hidden: boolean;
  tiles?: { responses: Fraction; able: Fraction; pace: Fraction; recommend: RecommendSummary; nps: number | null; applied: Fraction | null };
  charts?: {
    ability: Array<{ label: string; count: number }>;
    pace: Array<{ label: string; count: number }>;
    themes: Array<{ theme: string; positive: number; negative: number }>;
  };
  summary?: { text: string; source: string } | null;
  blockers?: string[];
  suggestions?: string[];
  quotes?: Array<{ text: string; theme: string }>;
};

const labelOf = (item: "ability" | "pace", id: string) => {
  if (id === "prefer_not_to_say") return "Prefer not to say";
  return DEFAULT_SESSION_GUIDE.rating_items.find((r) => r.id === item)?.choices.find((c) => c.id === id)?.label ?? id;
};

/** Turns the raw rows from session_results into tiles and chart data. */
export function shapeResults(raw: RawResults, session: SessionResults["session"], kind: "session" | "follow_up"): SessionResults {
  const base: SessionResults = { session, kind, responses: raw.responses, enrolled: raw.enrolled, min_group_size: raw.min_group_size, hidden: raw.hidden };
  if (raw.hidden) return base;
  const rows = raw.ratings ?? [];
  const abilityOrder = DEFAULT_SESSION_GUIDE.rating_items[0].choices.map((c) => c.id);
  const paceOrder = DEFAULT_SESSION_GUIDE.rating_items[1].choices.map((c) => c.id);
  const result: SessionResults = {
    ...base,
    tiles: {
      responses: responseRate(raw.responses, raw.enrolled),
      able: ableToApply(rows, raw.responses),
      pace: paceAboutRight(rows, raw.responses),
      recommend: recommend(rows),
      nps: netPromoterScore(rows),
      applied: kind === "follow_up" ? appliedAtWork(rows, raw.responses) : null,
    },
    charts: {
      ability: spread(rows, "ability", abilityOrder).map((s) => ({ label: labelOf("ability", s.choice), count: s.count })),
      pace: spread(rows, "pace", paceOrder).map((s) => ({ label: labelOf("pace", s.choice), count: s.count })),
      themes: themeMentions(raw.themes ?? []),
    },
    summary: raw.summary ? { text: raw.summary, source: raw.summary_source ?? "analyst" } : null,
    blockers: raw.blockers ?? [],
    suggestions: raw.suggestions ?? [],
  };
  if (raw.quotes) result.quotes = raw.quotes;
  return result;
}

export async function resultsFor(ctx: Ctx, sessionId: string, kind: "session" | "follow_up"): Promise<SessionResults> {
  const session = await sessionForUser(ctx, sessionId);
  if (!(await canReadResults(ctx, session.course_id))) throw forbidden("Results are for the course's instructors, sponsors and admins");
  const { data, error } = await ctx.db.rpc("session_results", { p_session: session.id, p_kind: kind });
  if (error) throw new Error(`session_results: ${error.message}`);
  if (!data) throw forbidden("Results are for the course's instructors and sponsor");
  return shapeResults(data as unknown as RawResults, { id: session.id, number: session.number, title: session.title, state: session.state }, kind);
}

/**
 * The aggregated metrics, themes and quotes for a session. Below min_group_size it returns only
 * the response count. Sponsors never get quotes, blockers or suggestions.
 */
export async function getSessionResults(ctx: Ctx, input: OperationInput<"get_session_results">) {
  return resultsFor(ctx, input.session_id, "session");
}

export async function getFollowUpResults(ctx: Ctx, sessionId: string) {
  return resultsFor(ctx, sessionId, "follow_up");
}

/** Quotes on their own: instructors and admins only. Anyone else gets 404. */
export async function getSessionQuotes(ctx: Ctx, sessionId: string) {
  const session = await sessionForUser(ctx, sessionId);
  if (!(await readsCourseDetail(ctx, session.course_id))) throw notFound("Not found");
  const results = await resultsFor(ctx, sessionId, "session");
  return { hidden: results.hidden, quotes: results.quotes ?? [] };
}

/** A small seeded shuffle, so tests can fix the order. */
export function shuffle<T>(items: T[], seed: number): T[] {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Transcript = {
  /** A sealed, single-use reference for the review buttons. Only for the page, never the API. */
  seal?: string;
  ratings: Record<string, string>;
  turns: Array<{ role: string; text: string; mode: string }>;
  summary: string[];
  insights: { themes: unknown; blockers: unknown; suggestions: unknown; quotes: unknown; accuracy: string | null } | null;
  state: string;
};

/**
 * The transcripts an instructor may read. Named interviews come with names. Anonymous ones come
 * without ids or times, in random order, and only at or above min_group_size. Private ones never
 * appear. Sponsors and learners get 404.
 */
export async function listInterviews(ctx: Ctx, input: OperationInput<"list_interviews">, opts: { seed?: number; withRefs?: boolean } = {}) {
  const session = await sessionForUser(ctx, input.session_id);
  if (!(await readsCourseDetail(ctx, session.course_id))) throw notFound("Not found");
  // Row Level Security and the column grants decide what comes back: no private interviews,
  // no anonymous ones below the threshold, and no timestamps at all.
  const { data: interviews, error } = await ctx.db
    .from("interviews")
    .select("id, anonymity, participant_id, state, summary, kind")
    .eq("session_id", session.id)
    .eq("kind", "session");
  if (error) throw new Error(`list interviews: ${error.message}`);
  const ids = (interviews ?? []).map((i) => i.id);
  const [{ data: turns }, { data: ratings }, { data: insights }, { data: names }, { data: count }, { data: course }] = await Promise.all([
    ctx.db.from("interview_turns").select("interview_id, seq, role, text, mode").in("interview_id", ids).order("seq"),
    ctx.db.from("ratings").select("interview_id, item_id, choice").in("interview_id", ids),
    ctx.db.from("insights").select("interview_id, themes, blockers, suggestions, quotes, accuracy").in("interview_id", ids),
    ctx.db.from("enrollments").select("user_id, display_name").eq("course_id", session.course_id),
    ctx.db.rpc("submitted_count", { p_session: session.id, p_kind: "session" }),
    ctx.db.from("courses").select("min_group_size").eq("id", session.course_id).single(),
  ]);
  const build = (id: string, summary: unknown, state: string): Transcript => ({
    ...(opts.withRefs ? { seal: sealRef(id) } : {}),
    ratings: Object.fromEntries((ratings ?? []).filter((r) => r.interview_id === id).map((r) => [r.item_id, r.choice])),
    turns: (turns ?? []).filter((t) => t.interview_id === id && t.mode !== "chip").map((t) => ({ role: t.role, text: t.text, mode: t.mode })),
    summary: (summary as string[] | null) ?? [],
    insights: (() => {
      const i = (insights ?? []).find((x) => x.interview_id === id);
      return i ? { themes: i.themes, blockers: i.blockers, suggestions: i.suggestions, quotes: i.quotes, accuracy: i.accuracy } : null;
    })(),
    state,
  });
  const nameOf = new Map((names ?? []).map((n) => [n.user_id, n.display_name]));
  const named = (interviews ?? [])
    .filter((i) => i.anonymity === "named")
    .map((i) => ({ ref: i.id, name: nameOf.get(i.participant_id ?? "") ?? "Learner", ...build(i.id, i.summary, i.state) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Sorted by content first, so the database's row order (which loosely follows when rows were
  // written) can't carry through, and a fixed seed gives a fixed order.
  const anonymousRaw = (interviews ?? [])
    .filter((i) => i.anonymity === "anonymous")
    .map((i) => build(i.id, i.summary, i.state))
    .sort((a, b) => JSON.stringify([a.summary, a.turns]).localeCompare(JSON.stringify([b.summary, b.turns])));
  const seed = opts.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
  const minGroup = course?.min_group_size ?? 5;
  return {
    named,
    anonymous: shuffle(anonymousRaw, seed),
    anonymous_hidden: (count ?? 0) < minGroup,
    min_group_size: minGroup,
  };
}

export async function recordAction(ctx: Ctx, input: OperationInput<"record_action">) {
  const session = await sessionForUser(ctx, input.session_id);
  if (!(await isInstructor(ctx, session.course_id))) throw forbidden("Only the course's instructors can record changes");
  const { data, error } = await ctx.db
    .from("actions")
    .insert({
      organization_id: session.organization_id,
      course_id: session.course_id,
      session_id: session.id,
      you_said: input.you_said,
      we_did: input.we_did,
      status: input.status,
      created_by: ctx.user!.id,
    })
    .select("id, you_said, we_did, status, created_at")
    .single();
  if (error) throw new Error(`record action: ${error.message}`);
  return { action: data };
}

