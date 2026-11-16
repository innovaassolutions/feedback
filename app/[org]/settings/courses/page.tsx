import Link from "next/link";
import { requireBranding } from "@/lib/branding";
import { createUserClient } from "@/lib/supabase/server";
import { createCourse } from "@/lib/actions/organizations";
import { Card, PageTitle } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";
import { NameAndAddress } from "@/components/forms/name-and-address";
import { publicEnv } from "@/lib/env";

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
          <NameAndAddress
            nameLabel="Course title"
            nameField="title"
            base={`${new URL(publicEnv.appUrl).host}/${org}/`}
            placeholder="onboarding"
            help="A short name for the course's pages. Lowercase letters, numbers and hyphens. It can't be changed later, because links and QR codes use it."
          />
        </ActionForm>
      </Card>
    </>
  );
}
