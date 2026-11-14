import { requireCourse } from "@/lib/course";
import { createUserClient } from "@/lib/supabase/server";
import { Card, PageTitle } from "@/components/ui";
import { InviteForm } from "@/components/admin/invite-form";

export default async function RosterPage({ params }: PageProps<"/[org]/[course]/admin/roster">) {
  const { org, course } = await params;
  const ctx = await requireCourse(org, course);
  const db = await createUserClient();
  const { data: learners } = await db
    .from("enrollments")
    .select("id, display_name, email, created_at")
    .eq("course_id", ctx.course.id)
    .order("display_name");
  return (
    <>
      <PageTitle title="Roster" subtitle={`${learners?.length ?? 0} learners enrolled`} />
      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Invite learners</h2>
        <InviteForm courseId={ctx.course.id} />
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Learners</h2>
        <ul className="divide-y divide-border" data-testid="roster">
          {(learners ?? []).map((l) => (
            <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>{l.display_name}</span>
              <span className="text-sm text-muted">{l.email}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
