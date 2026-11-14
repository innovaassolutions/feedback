import Link from "next/link";
import { requireBranding } from "@/lib/branding";
import { createUserClient } from "@/lib/supabase/server";
import { createCourse } from "@/lib/actions/organizations";
import { Card, Field, PageTitle, inputClass } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";

export default async function CoursesPage({ params }: PageProps<"/[org]/settings/courses">) {
  const { org } = await params;
  const branding = await requireBranding(org);
  const db = await createUserClient();
  const { data: courses } = await db.from("courses").select("id, slug, title").eq("organization_id", branding.id).order("title");
  return (
    <>
      <PageTitle title="Courses" subtitle={branding.name} />
      <Card className="mb-6">
        <ul className="divide-y divide-border" data-testid="course-list">
          {(courses ?? []).map((c) => (
            <li key={c.id} className="py-2">
              <Link href={`/${org}/${c.slug}/admin`}>{c.title}</Link>
            </li>
          ))}
          {courses?.length ? null : <li className="py-2 text-muted">No courses yet.</li>}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">New course</h2>
        <ActionForm action={createCourse} submit="Create course">
          <input type="hidden" name="organization_id" value={branding.id} />
          <input type="hidden" name="org_slug" value={org} />
          <Field label="Course title"><input name="title" required className={inputClass} /></Field>
          <Field label="Course address" hint={`/${org}/…`}><input name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,48}[a-z0-9]" className={inputClass} /></Field>
        </ActionForm>
      </Card>
    </>
  );
}
