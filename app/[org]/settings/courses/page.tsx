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
  const [{ data: courses }, { data: sessions }, { data: enrolled }] = await Promise.all([
    db.from("courses").select("id, slug, title").eq("organization_id", branding.id).order("title"),
    db.from("sessions").select("course_id").eq("organization_id", branding.id),
    db.from("enrollments").select("course_id").eq("organization_id", branding.id),
  ]);
  const count = (rows: Array<{ course_id: string }> | null, id: string) => (rows ?? []).filter((r) => r.course_id === id).length;
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  return (
    <>
      <PageTitle title="Courses" subtitle={branding.name} />
      <p className="-mt-3 mb-6 max-w-3xl text-muted">
        Each course is a series of sessions. Create the course here, then add its sessions, learners and documents in its setup.
      </p>
      <Card className="mb-6">
        <ul className="divide-y divide-border" data-testid="course-list">
          {(courses ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span>
                <Link href={`/${org}/${c.slug}/admin`} className="font-medium">{c.title}</Link>
                <span className="block text-sm text-muted">
                  {plural(count(sessions, c.id), "session")} · {plural(count(enrolled, c.id), "learner")}
                </span>
              </span>
              <span className="flex gap-4 text-sm">
                <Link href={`/${org}/${c.slug}/admin`}>Set up sessions</Link>
                <Link href={`/${org}/${c.slug}/admin/details`}>Rename or delete</Link>
              </span>
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
