import type { JobDeps } from "@/lib/server/jobs/queue";

/** Emails each instructor of a course. Returns how many were sent. */
export async function emailInstructors(deps: JobDeps, courseId: string, subject: string, text: string): Promise<number> {
  const { data: instructors } = await deps.admin.from("memberships").select("email").eq("course_id", courseId).eq("role", "instructor");
  for (const i of instructors ?? []) await deps.mailer.send({ to: i.email, subject, text });
  return instructors?.length ?? 0;
}

/** Job: a learner reported a blocker during an interview. The instructor hears at once. */
export async function notifyBlocker(payload: { session_id: string; summary: string }, deps: JobDeps) {
  const { data: session } = await deps.admin.from("sessions").select("course_id, number, title").eq("id", payload.session_id).single();
  if (!session) return;
  await emailInstructors(
    deps,
    session.course_id,
    `A learner is blocked after Session ${session.number}`,
    `During a feedback interview on Session ${session.number}: ${session.title}, a learner reported something stopping them:\n\n${payload.summary}\n\nThe learner's name is shared only if they chose a named interview.`,
  );
}
