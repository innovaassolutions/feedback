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
      <p className="mb-3 mt-1 font-heading text-2xl font-semibold" data-testid="setup-course-title">
        {ctx.course.title}
      </p>
      <SetupTabs
        tabs={[
          { href: base, label: "Sessions", match: [base, `${base}/sessions`] },
          { href: `${base}/roster`, label: "Learners", match: [`${base}/roster`] },
          { href: `${base}/guide`, label: "Interview guide", match: [`${base}/guide`] },
        ]}
      />
      {children}
    </div>
  );
}
