import { requireCourse } from "@/lib/course";
import { OrgHeader, type NavItem } from "@/components/org-header";

export default async function MainLayout({ children, params }: LayoutProps<"/[org]/[course]">) {
  const { org, course } = await params;
  const ctx = await requireCourse(org, course);
  const base = `/${org}/${course}`;
  const nav: NavItem[] = [{ href: base, label: "Sessions" }];
  if (ctx.can.readResults) nav.push({ href: `${base}/dashboard`, label: "Dashboard" });
  if (ctx.can.manage) nav.push({ href: `${base}/admin`, label: "Admin" });
  if (ctx.roles.has("org_admin") || ctx.roles.has("platform_admin")) {
    nav.push({ href: `/${org}/settings/brand`, label: "Branding" }, { href: `/${org}/settings/people`, label: "People" });
  }
  return (
    <>
      <OrgHeader orgSlug={org} orgName={ctx.org.name} logoPath={ctx.org.logo_path} nav={nav} email={ctx.email} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
