import { requireBranding } from "@/lib/branding";
import { createUserClient } from "@/lib/supabase/server";
import { logoUrl, publicEnv } from "@/lib/env";
import { themeTokensSchema, type ThemeTokens } from "@/lib/theme/tokens";
import { Card, PageTitle } from "@/components/ui";
import { EditForm } from "@/components/admin/edit-forms";
import { BrandStudio } from "@/components/brand/brand-studio";

export default async function BrandPage({ params }: PageProps<"/[org]/settings/brand">) {
  const { org } = await params;
  const branding = await requireBranding(org);
  const db = await createUserClient();
  const { data } = await db
    .from("themes")
    .select("id, status, tokens, created_at, approved_at, source, logo_path")
    .eq("organization_id", branding.id)
    .order("created_at", { ascending: false });
  const themes = (data ?? [])
    .filter((t) => themeTokensSchema.safeParse(t.tokens).success)
    .map((t) => ({ ...t, tokens: t.tokens as unknown as ThemeTokens, logo_url: logoUrl(t.logo_path) }));
  const live = themes.find((t) => t.status === "live") ?? null;
  const proposal = themes.find((t) => t.status === "proposed" && (!live || t.created_at > live.created_at)) ?? null;
  return (
    <>
      <PageTitle title="Branding" subtitle="Upload a logo and the Brand designer proposes a theme. Nothing changes until you approve it." />
      <Card className="mb-6">
        <h2 className="mb-1 text-lg font-semibold">Name and web address</h2>
        <p className="mb-3 text-sm text-muted">
          The name shows on every page and email. The web address is the organization&apos;s part of every link on this platform.
        </p>
        <EditForm
          toggle="Rename or change the web address"
          path={`/api/organizations/${branding.id}`}
          redirect="/{slug}/settings/brand"
          testId="organization-details"
          fields={[
            { name: "name", label: "Organization name", value: branding.name },
            {
              name: "slug",
              label: "Web address",
              type: "web-address",
              value: branding.slug,
              base: `${new URL(publicEnv.appUrl).host}/`,
              hint: "The organization's short name in every web address: lowercase letters, numbers and hyphens, such as streamspace. It isn't the organization's own website.",
            },
          ]}
        />
      </Card>
      <BrandStudio organizationId={branding.id} orgName={branding.name} logoUrl={logoUrl(branding.logo_path)} live={live} proposal={proposal} history={themes} />
    </>
  );
}
