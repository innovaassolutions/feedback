import Link from "next/link";
import { requireCourse } from "@/lib/course";
import { createUserClient } from "@/lib/supabase/server";
import { SESSION_STATE_LABEL, formatDate } from "@/lib/labels";
import { Badge, Card, PageTitle } from "@/components/ui";
import { NewSessionForm } from "@/components/admin/new-session-form";
import { StateButton } from "@/components/admin/state-button";
import { DocumentationForm } from "@/components/admin/documentation-form";

export default async function AdminPage({ params }: PageProps<"/[org]/[course]/admin">) {
  const { org, course } = await params;
  const ctx = await requireCourse(org, course);
  const db = await createUserClient();
  const { data: sessions } = await db.from("sessions").select("id, number, title, date, state").eq("course_id", ctx.course.id).order("number");
  const orgAdmin = ctx.roles.has("org_admin") || ctx.roles.has("platform_admin");
  const { data: sources } = orgAdmin
    ? await db.from("documentation_sources").select("id, url, status, page_count, error, last_read_at").eq("organization_id", ctx.org.id).order("created_at")
    : { data: null };
  return (
    <>
      <PageTitle title="Administration" subtitle={ctx.course.title} />
      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Sessions</h2>
        <ul className="divide-y divide-border" data-testid="admin-sessions">
          {(sessions ?? []).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <Link href={`/${org}/${course}/admin/sessions/${s.number}`} className="font-medium">
                  Session {s.number}: {s.title}
                </Link>
                <p className="text-sm text-muted">{formatDate(s.date)}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={s.state === "open" ? "primary" : "neutral"}>{SESSION_STATE_LABEL[s.state]}</Badge>
                <StateButton sessionId={s.id} state={s.state} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">New session</h2>
        <NewSessionForm courseId={ctx.course.id} />
      </Card>
      {orgAdmin ? (
        <Card className="mt-6">
          <h2 className="mb-1 text-lg font-semibold">Product documentation</h2>
          <p className="mb-3 text-sm text-muted">The Librarian answers questions from these pages as well as each session&apos;s documents. They serve every course in {ctx.org.name}.</p>
          <DocumentationForm organizationId={ctx.org.id} sources={sources ?? []} />
        </Card>
      ) : null}
    </>
  );
}
