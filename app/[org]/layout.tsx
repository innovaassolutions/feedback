import { notFound } from "next/navigation";
import { getBranding } from "@/lib/branding";
import { PLATFORM_THEME, themeCss } from "@/lib/theme/tokens";

export default async function OrgLayout({ children, params }: LayoutProps<"/[org]">) {
  const { org } = await params;
  const branding = await getBranding(org);
  if (!branding) notFound();
  const css = themeCss(branding.tokens ?? PLATFORM_THEME, "[data-org-theme]");
  return (
    <div data-org-theme={branding.slug} className="min-h-screen bg-background text-text">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {children}
    </div>
  );
}
