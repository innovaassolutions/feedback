import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireBranding } from "@/lib/branding";
import { listMyCourses } from "@/lib/my-courses";
import { OrgHeader } from "@/components/org-header";
import { Card, PageTitle } from "@/components/ui";

export default async function OrgHome({ params }: PageProps<"/[org]">) {
  const { org } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/${org}/sign-in?next=/${org}`);
  const branding = await requireBranding(org);
  const courses = (await listMyCourses()).filter((c) => c.orgSlug === org);
  if (courses.length === 1) redirect(`/${org}/${courses[0].courseSlug}`);
  return (
    <>
      <OrgHeader orgSlug={org} orgName={branding.name} logoPath={branding.logo_path} email={user.email} />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <PageTitle title="Courses" />
        {courses.length === 0 ? (
          <Card><p className="text-muted">You aren&apos;t part of a course here.</p></Card>
        ) : (
          <ul className="space-y-3">
            {courses.map((c) => (
              <li key={c.courseSlug}>
                <Card><Link href={`/${org}/${c.courseSlug}`} className="text-lg font-medium">{c.title}</Link></Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
