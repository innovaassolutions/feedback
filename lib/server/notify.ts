import { publicEnv } from "@/lib/env";
import type { JobDeps } from "@/lib/server/jobs/queue";
import { brandForOrganization } from "@/lib/server/mail/brand";
import { brandedEmail, type EmailBlock } from "@/lib/server/mail/layout";

export type InstructorNotice = {
  subject: string;
  body: EmailBlock[];
  /** A page of the course, such as "dashboard" or "sessions/2", and the button's label. */
  button: { label: string; path: string };
};

/** Emails each instructor of a course, in the organization's branding. Returns how many were sent. */
export async function emailInstructors(deps: JobDeps, courseId: string, notice: InstructorNotice): Promise<number> {
  const [{ data: course }, { data: instructors }] = await Promise.all([
    deps.admin.from("courses").select("organization_id, slug, organizations!inner(slug)").eq("id", courseId).single(),
    deps.admin.from("memberships").select("email").eq("course_id", courseId).eq("role", "instructor"),
  ]);
  if (!course || !instructors?.length) return 0;
  const brand = await brandForOrganization(deps.admin, course.organization_id);
  const url = `${publicEnv.appUrl}/${course.organizations.slug}/${course.slug}/${notice.button.path}`;
  for (const i of instructors) {
    await deps.mailer.send(
      brandedEmail(i.email, notice.subject, brand, {
        preview: typeof notice.body[0] === "string" ? notice.body[0] : notice.subject,
        heading: notice.subject,
        body: notice.body,
        button: { label: notice.button.label, url },
      }),
    );
  }
  return instructors.length;
}

/** Job: a learner reported a blocker during an interview. The instructor hears at once. */
export async function notifyBlocker(payload: { session_id: string; summary: string }, deps: JobDeps) {
  const { data: session } = await deps.admin.from("sessions").select("course_id, number, title").eq("id", payload.session_id).single();
  if (!session) return;
  await emailInstructors(deps, session.course_id, {
    subject: `A learner is blocked after Session ${session.number}`,
    body: [
      `During a feedback interview on Session ${session.number}: ${session.title}, a learner reported something stopping them:`,
      { quote: payload.summary },
      "The learner's name is shared only if they chose a named interview.",
    ],
    button: { label: "Open the dashboard", path: "dashboard" },
  });
}
