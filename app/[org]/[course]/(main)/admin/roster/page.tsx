import { requireCourse } from "@/lib/course";
import { createUserClient } from "@/lib/supabase/server";
import { Card, PageTitle } from "@/components/ui";
import { InviteForm } from "@/components/admin/invite-form";
import { ActionButton, DeleteButton, EditForm } from "@/components/admin/edit-forms";

export default async function RosterPage({ params }: PageProps<"/[org]/[course]/admin/roster">) {
  const { org, course } = await params;
  const ctx = await requireCourse(org, course);
  const db = await createUserClient();
  const { data: learners } = await db
    .from("enrollments")
    .select("id, display_name, email, created_at")
    .eq("course_id", ctx.course.id)
    .order("display_name");
  const { data: status } = await db.rpc("roster_sign_in_status", { p_course: ctx.course.id });
  const signedIn = new Map((status ?? []).map((s) => [s.enrollment_id, s.signed_in]));
  const waiting = (learners ?? []).filter((l) => !signedIn.get(l.id)).length;
  return (
    <>
      <PageTitle title="Learners" subtitle={`${learners?.length ?? 0} enrolled${waiting ? `, ${waiting} not signed in yet` : ""}`} />
      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Invite learners</h2>
        <InviteForm courseId={ctx.course.id} />
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Learners</h2>
        <ul className="divide-y divide-border" data-testid="roster">
          {(learners ?? []).map((l) => (
            <li key={l.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
              <span className="min-w-0">
                {l.display_name} <span className="text-sm text-muted">{l.email}</span>
                <span className={signedIn.get(l.id) ? "block text-sm text-success" : "block text-sm text-muted"} data-testid="sign-in-status">
                  {signedIn.get(l.id) ? "✓ Signed in" : "Not signed in yet"}
                </span>
              </span>
              <span className="flex flex-wrap items-start gap-2">
                <ActionButton
                  path={`/api/enrollments/${l.id}/invite`}
                  label={signedIn.get(l.id) ? "Send a sign-in email" : "Resend invitation"}
                  done="Sent"
                />
                <EditForm toggle="Edit name" path={`/api/enrollments/${l.id}`} fields={[{ name: "display_name", label: "Name", value: l.display_name }]} />
                <DeleteButton path={`/api/enrollments/${l.id}`} what={`${l.display_name} from the course`} label="Remove" />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
