import type { AdminClient } from "@/lib/server/supabase-admin";
import type { Tables } from "@/lib/database.types";
import { DEFAULT_FOLLOW_UP_GUIDE, DEFAULT_SESSION_GUIDE, guidePartSchema, type GuidePart } from "@/lib/guide";
import type { ActionItem, Brief, EngineSetup, EngineState, Turn } from "@/agents/interviewer/engine";
import type { Progress, Stage } from "@/agents/interviewer/schema";

export type InterviewRow = Tables<"interviews">;

export async function loadGuide(db: AdminClient, courseId: string, kind: "session" | "follow_up"): Promise<GuidePart> {
  const { data } = await db.from("guides").select("rating_items, topics, follow_up").eq("course_id", courseId).maybeSingle();
  if (!data) return kind === "session" ? DEFAULT_SESSION_GUIDE : DEFAULT_FOLLOW_UP_GUIDE;
  const part = kind === "session" ? { rating_items: data.rating_items, topics: data.topics } : data.follow_up;
  const parsed = guidePartSchema.safeParse(part);
  return parsed.success ? parsed.data : kind === "session" ? DEFAULT_SESSION_GUIDE : DEFAULT_FOLLOW_UP_GUIDE;
}

/** "You said, we did" items recorded on the previous session: the Interviewer asks if they helped. */
export async function actionsBefore(db: AdminClient, courseId: string, sessionNumber: number): Promise<ActionItem[]> {
  if (sessionNumber <= 1) return [];
  const { data: prev } = await db.from("sessions").select("id").eq("course_id", courseId).eq("number", sessionNumber - 1).maybeSingle();
  if (!prev) return [];
  const { data } = await db.from("actions").select("you_said, we_did").eq("session_id", prev.id).order("created_at");
  return data ?? [];
}

/**
 * Everything the Interviewer may know for one interview: the guide, the approved brief, the
 * changes since last session, and the learner's first name only if the interview is named.
 * It never gets raw documents, other learners' feedback, the roster or the dashboard.
 */
export async function loadSetup(db: AdminClient, iv: InterviewRow): Promise<EngineSetup> {
  const [{ data: course }, { data: session }] = await Promise.all([
    db.from("courses").select("title, max_turns, max_minutes").eq("id", iv.course_id).single(),
    db.from("sessions").select("number, title, brief, brief_approved_at").eq("id", iv.session_id).single(),
  ]);
  if (!course || !session) throw new Error("interview setup: course or session missing");
  const guide = await loadGuide(db, iv.course_id, iv.kind);
  const actions = iv.kind === "session" ? await actionsBefore(db, iv.course_id, session.number) : [];
  let learnerName: string | null = null;
  if (iv.anonymity === "named" && iv.participant_id) {
    const { data: enrollment } = await db.from("enrollments").select("display_name").eq("course_id", iv.course_id).eq("user_id", iv.participant_id).maybeSingle();
    learnerName = enrollment?.display_name.split(" ")[0] ?? null;
  }
  return {
    kind: iv.kind,
    guide,
    brief: session.brief_approved_at ? (session.brief as Brief) : null,
    actions,
    courseTitle: course.title,
    sessionTitle: `Session ${session.number}: ${session.title}`,
    learnerName,
    limits: { maxTurns: course.max_turns, maxMinutes: course.max_minutes },
  };
}

/** A gap with no activity counts for at most this long towards the interview's time limit. */
export const IDLE_CAP_SECONDS = 300;

/**
 * Time spent in the interview, for its time limit. A learner who leaves and comes back later isn't
 * already at time: a resumed voice trial was wrapped up on its first answer, 37 minutes after it
 * started. The engine measures from `startedAt`, so this returns a start that far back from now.
 */
export function activeTime(iv: Pick<InterviewRow, "started_at" | "last_activity_at">, progress: Progress, now: Date): { startedAt: Date; activeSeconds: number } {
  const last = Date.parse(iv.last_activity_at);
  const before = progress.active_seconds ?? Math.max(0, (last - Date.parse(iv.started_at)) / 1000);
  const gap = Math.min(Math.max(0, (now.getTime() - last) / 1000), IDLE_CAP_SECONDS);
  const activeSeconds = Math.round(before + gap);
  return { startedAt: new Date(now.getTime() - activeSeconds * 1000), activeSeconds };
}

export async function loadState(db: AdminClient, iv: InterviewRow): Promise<EngineState & { lastSeq: number }> {
  const [{ data: turns }, { data: ratings }] = await Promise.all([
    db.from("interview_turns").select("seq, role, text, stage").eq("interview_id", iv.id).order("seq"),
    db.from("ratings").select("item_id, choice").eq("interview_id", iv.id),
  ]);
  return {
    stage: iv.stage as Stage,
    progress: iv.progress as unknown as Progress,
    turnCount: iv.turn_count,
    startedAt: new Date(iv.started_at),
    ratings: Object.fromEntries((ratings ?? []).map((r) => [r.item_id, r.choice])),
    history: (turns ?? []).filter((t) => t.role === "learner" || t.role === "interviewer").map((t) => ({ role: t.role as Turn["role"], text: t.text, stage: t.stage as Stage })),
    lastSeq: turns?.length ? turns[turns.length - 1].seq : 0,
  };
}
