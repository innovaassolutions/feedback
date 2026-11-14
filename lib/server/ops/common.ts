import type { Ctx } from "@/lib/server/ctx";
import { requireUser } from "@/lib/server/ctx";
import { forbidden, notFound } from "@/lib/server/http";
import { runJobs } from "@/lib/server/jobs/run";

/** Loads a session through Row Level Security. Unknown and other-organization ids are both 404. */
export async function sessionForUser(ctx: Ctx, sessionId: string) {
  requireUser(ctx);
  const { data } = await ctx.db
    .from("sessions")
    .select("id, organization_id, course_id, number, title, date, objectives, state, brief, brief_draft, brief_draft_at, brief_approved_at, opened_at, closes_at, closed_at, summary, summary_source")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) throw notFound("Session not found");
  return data;
}

export async function courseForUser(ctx: Ctx, courseId: string) {
  requireUser(ctx);
  const { data } = await ctx.db.from("courses").select("*, organizations!inner(slug, name)").eq("id", courseId).maybeSingle();
  if (!data) throw notFound("Course not found");
  return data;
}

async function rpcBool(ctx: Ctx, fn: "can_manage_course" | "can_read_results" | "is_enrolled" | "can_see_course", course: string) {
  const { data, error } = await ctx.db.rpc(fn, { course });
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data === true;
}

export async function canManage(ctx: Ctx, courseId: string) {
  return rpcBool(ctx, "can_manage_course", courseId);
}

export async function requireManage(ctx: Ctx, courseId: string) {
  if (!(await canManage(ctx, courseId))) throw forbidden("Only the course's instructors can do this");
}

export async function isInstructor(ctx: Ctx, courseId: string) {
  const { data } = await ctx.db.rpc("has_course_role", { course: courseId, wanted: "instructor" });
  return data === true;
}

export async function requireInstructor(ctx: Ctx, courseId: string) {
  if (!(await isInstructor(ctx, courseId))) throw forbidden("Only the course's instructors can do this");
}

export async function canReadResults(ctx: Ctx, courseId: string) {
  return rpcBool(ctx, "can_read_results", courseId);
}

export async function isEnrolled(ctx: Ctx, courseId: string) {
  return rpcBool(ctx, "is_enrolled", courseId);
}

/** Processes queued background work once the response has gone. */
export function kickJobs(ctx: Ctx) {
  ctx.defer(() => runJobs({ admin: ctx.admin, now: ctx.now, mailer: ctx.mailer }));
}
