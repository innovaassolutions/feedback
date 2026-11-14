import { requireBranding } from "@/lib/branding";
import { createUserClient } from "@/lib/supabase/server";
import { logoUrl } from "@/lib/env";
import { themeTokensSchema, type ThemeTokens } from "@/lib/theme/tokens";
import { PageTitle } from "@/components/ui";
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
      <BrandStudio organizationId={branding.id} orgName={branding.name} logoUrl={logoUrl(branding.logo_path)} live={live} proposal={proposal} history={themes} />
    </>
  );
}
