import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireBranding } from "@/lib/branding";
import { listMyCourses } from "@/lib/my-courses";
import { createUserClient } from "@/lib/supabase/server";
import { OrgHeader, type NavItem } from "@/components/org-header";
import { Card, PageTitle } from "@/components/ui";

export default async function OrgHome({ params }: PageProps<"/[org]">) {
  const { org } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/${org}/sign-in?next=/${org}`);
  const branding = await requireBranding(org);
  const courses = (await listMyCourses()).filter((c) => c.orgSlug === org);
  if (courses.length === 1) redirect(`/${org}/${courses[0].courseSlug}`);
  // An organization admin with no course yet (a new organization) must still reach the settings.
  const { data: isAdmin } = await (await createUserClient()).rpc("is_org_admin", { org: branding.id });
  const nav: NavItem[] = isAdmin
    ? [
        { href: `/${org}/settings/brand`, label: "Branding" },
        { href: `/${org}/settings/courses`, label: "Manage courses" },
      ]
    : [];
  return (
    <>
      <OrgHeader orgSlug={org} orgName={branding.name} logoPath={branding.logo_path} nav={nav} email={user.email} />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <PageTitle title="Courses" />
        {courses.length === 0 ? (
          <Card>
            {isAdmin ? (
              <p className="text-muted">
                There are no courses yet. <Link href={`/${org}/settings/courses`}>Create the first course</Link>.
              </p>
            ) : (
              <p className="text-muted">You aren&apos;t part of a course here.</p>
            )}
          </Card>
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
