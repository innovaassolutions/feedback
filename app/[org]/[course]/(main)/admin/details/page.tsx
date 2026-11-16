import { requireCourse } from "@/lib/course";
import { publicEnv } from "@/lib/env";
import { Card } from "@/components/ui";
import { DeleteButton, EditForm } from "@/components/admin/edit-forms";

/** The course's title, web address and settings, and deleting a course that has no feedback yet. */
export default async function CourseDetailsPage({ params }: PageProps<"/[org]/[course]/admin/details">) {
  const { org, course } = await params;
  const ctx = await requireCourse(org, course);
  const c = ctx.course;
  const orgAdmin = ctx.roles.has("org_admin") || ctx.roles.has("platform_admin");
  const host = new URL(publicEnv.appUrl).host;
  return (
    <>
      <Card className="mb-6">
        <h1 className="mb-1 text-lg font-semibold">Course details</h1>
        <p className="mb-4 text-sm text-muted">
          The title shows on every page and email. The settings apply to every session of the course.
        </p>
        <EditForm
          path={`/api/courses/${c.id}`}
          redirect={`/${org}/{slug}/admin/details`}
          testId="course-details"
          fields={[
            { name: "title", label: "Course title", value: c.title, wide: true },
            {
              name: "slug",
              label: "Web address",
              type: "web-address",
              value: c.slug,
              base: `${host}/${org}/`,
              hint: "The course's short name in its web address: lowercase letters, numbers and hyphens, such as ime-engineering. It isn't a website address. Learners' links and the QR codes use it.",
              locked: !orgAdmin,
              lockedNote: "Only an organization admin can change it.",
            },
            { name: "feedback_window_days", label: "Feedback window (days)", type: "number", value: c.feedback_window_days, min: 1, max: 90, hint: "How long feedback stays open" },
            { name: "follow_up_days", label: "Follow-up after (days)", type: "number", value: c.follow_up_days, min: 1, max: 365, hint: "After the last session" },
            { name: "max_turns", label: "Interview length (turns)", type: "number", value: c.max_turns, min: 4, max: 60, hint: "The most replies an interview takes" },
            { name: "max_minutes", label: "Interview length (minutes)", type: "number", value: c.max_minutes, min: 2, max: 120 },
            { name: "retention_days", label: "Keep transcripts for (days)", type: "number", value: c.retention_days, min: 1, max: 3650, hint: "Scores and themes are kept" },
          ]}
        />
      </Card>
      {orgAdmin ? (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Delete this course</h2>
          <p className="mb-3 text-sm text-muted">
            Deletes the course with its sessions, documents and roster. A course that has learner feedback can&apos;t be deleted; rename it instead.
          </p>
          <DeleteButton path={`/api/courses/${c.id}`} what={`“${c.title}”`} label="Delete course" redirect={`/${org}/settings/courses`} testId="delete-course" />
        </Card>
      ) : null}
    </>
  );
}
