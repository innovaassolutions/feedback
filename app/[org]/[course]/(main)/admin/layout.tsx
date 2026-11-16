import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCourse } from "@/lib/course";
import { SetupTabs } from "@/components/admin/setup-tabs";

/** Course setup: the course's sessions, its learners and its interview guide. */
export default async function AdminLayout({ children, params }: LayoutProps<"/[org]/[course]/admin">) {
  const { org, course } = await params;
  const ctx = await requireCourse(org, course);
  if (!ctx.can.manage) notFound();
  const base = `/${org}/${course}/admin`;
  const orgAdmin = ctx.roles.has("org_admin") || ctx.roles.has("platform_admin");
  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        {orgAdmin ? (
          <>
            <Link href={`/${org}/settings/courses`}>Courses</Link> <span aria-hidden="true">›</span>{" "}
          </>
        ) : null}
        Course setup
      </nav>
      <div className="mb-3 mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="font-heading text-2xl font-semibold" data-testid="setup-course-title">
          {ctx.course.title}
        </p>
        <Link href={`${base}/details`} className="text-sm">Rename or change settings</Link>
      </div>
      <SetupTabs
        tabs={[
          { href: base, label: "Sessions", match: [base, `${base}/sessions`] },
          { href: `${base}/roster`, label: "Learners", match: [`${base}/roster`] },
          { href: `${base}/guide`, label: "Interview guide", match: [`${base}/guide`] },
          { href: `${base}/details`, label: "Course details", match: [`${base}/details`] },
        ]}
      />
      {children}
    </div>
  );
}
