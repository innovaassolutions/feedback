import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireBranding } from "@/lib/branding";
import { createUserClient } from "@/lib/supabase/server";
import { currentPath } from "@/lib/request";
import { OrgHeader } from "@/components/org-header";

/** Organization settings are for organization admins (and the platform admin). */
export default async function SettingsLayout({ children, params }: LayoutProps<"/[org]/settings">) {
  const { org } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/${org}/sign-in?next=${encodeURIComponent(await currentPath())}`);
  const branding = await requireBranding(org);
  const db = await createUserClient();
  const { data: admin } = await db.rpc("is_org_admin", { org: branding.id });
  if (!admin) notFound();
  return (
    <>
      <OrgHeader
        orgSlug={org}
        orgName={branding.name}
        logoPath={branding.logo_path}
        email={user.email}
        nav={[
          { href: `/${org}/settings/brand`, label: "Branding" },
          { href: `/${org}/settings/courses`, label: "Courses" },
        ]}
      />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
