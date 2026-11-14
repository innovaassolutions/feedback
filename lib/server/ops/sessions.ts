import type { Ctx } from "@/lib/server/ctx";
import type { OperationInput } from "@/lib/operations";
import { conflict } from "@/lib/server/http";
import { nextSessionState, type SessionState } from "@/lib/labels";
import type { TablesUpdate } from "@/lib/database.types";
import { canManage, courseForUser, requireManage, sessionForUser } from "./common";

export async function listSessions(ctx: Ctx, input: OperationInput<"list_sessions">) {
  const course = await courseForUser(ctx, input.course_id);
  const [{ data: sessions }, { data: counts }] = await Promise.all([
    ctx.db.from("sessions").select("id, number, title, date, state").eq("course_id", course.id).order("number"),
    ctx.db.rpc("session_response_counts", { p_course: course.id }),
  ]);
  const byId = new Map((counts ?? []).map((c) => [c.session_id, c]));
  return {
    sessions: (sessions ?? []).map((s) => ({
      ...s,
      responses: byId.get(s.id)?.responses ?? 0,
      enrolled: byId.get(s.id)?.enrolled ?? 0,
    })),
  };
}

/**
 * The session, its approved brief and the documents the user may see. The brief is null until
 * an instructor approves it, so the Interviewer never works from an unreviewed draft.
 */
export async function getSession(ctx: Ctx, input: OperationInput<"get_session">) {
  const session = await sessionForUser(ctx, input.session_id);
  const manager = await canManage(ctx, session.course_id);
  const { data: documents } = await ctx.db
    .from("documents")
    .select("id, title, audience, status, error, file_name, size_bytes, created_at")
    .eq("session_id", session.id)
    .order("created_at");
  return {
    session: {
      id: session.id,
      course_id: session.course_id,
      number: session.number,
      title: session.title,
      date: session.date,
      state: session.state,
      objectives: session.objectives,
      brief: session.brief_approved_at ? session.brief : null,
    },
    documents: (documents ?? []).map((d) => ({ ...d, download_url: `/api/documents/${d.id}/download` })),
    ...(manager ? { brief_draft: session.brief_draft, brief_draft_at: session.brief_draft_at } : {}),
  };
}

export async function createSession(ctx: Ctx, input: OperationInput<"create_session">) {
  const course = await courseForUser(ctx, input.course_id);
  await requireManage(ctx, course.id);
  const { data: last } = await ctx.db
    .from("sessions")
    .select("number")
    .eq("course_id", course.id)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await ctx.db
    .from("sessions")
    .insert({
      organization_id: course.organization_id,
      course_id: course.id,
      number: (last?.number ?? 0) + 1,
      title: input.title,
      date: input.date,
      objectives: input.objectives,
      state: "draft",
    })
    .select("id, number, title, date, state, objectives")
    .single();
  if (error) throw new Error(`create session: ${error.message}`);
  return { session: data };
}

/** Moves a session one step along draft → scheduled → open → closed, and no other way. */
export async function setSessionState(ctx: Ctx, input: OperationInput<"set_session_state">) {
  const session = await sessionForUser(ctx, input.session_id);
  await requireManage(ctx, session.course_id);
  const expected = nextSessionState(session.state as SessionState);
  if (input.state !== expected) {
    throw conflict(
      expected
        ? `A session that is ${session.state} can only move to ${expected}`
        : "A closed session can't change state",
      { state: session.state },
    );
  }
  const now = ctx.now();
  const patch: TablesUpdate<"sessions"> = { state: input.state };
  if (input.state === "open") {
    const { data: course } = await ctx.db.from("courses").select("feedback_window_days").eq("id", session.course_id).single();
    patch.opened_at = now.toISOString();
    patch.closes_at = new Date(now.getTime() + (course?.feedback_window_days ?? 7) * 86_400_000).toISOString();
  }
  if (input.state === "closed") patch.closed_at = now.toISOString();
  const { data, error } = await ctx.db
    .from("sessions")
    .update(patch)
    .eq("id", session.id)
    .eq("state", session.state)
    .select("id, number, state, opened_at, closes_at, closed_at")
    .maybeSingle();
  if (error) throw new Error(`set state: ${error.message}`);
  if (!data) throw conflict("The session changed while you were editing it. Reload and try again.");
  return { session: data };
}

export async function approveBrief(ctx: Ctx, input: OperationInput<"approve_brief">) {
  const session = await sessionForUser(ctx, input.session_id);
  await requireManage(ctx, session.course_id);
  const brief = { objectives: input.objectives, topics: input.topics, known_issues: input.known_issues };
  const { error } = await ctx.db
    .from("sessions")
    .update({ brief, brief_approved_at: ctx.now().toISOString(), brief_approved_by: ctx.user!.id })
    .eq("id", session.id);
  if (error) throw new Error(`approve brief: ${error.message}`);
  return { brief };
}
