import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";
import { themeTokensSchema, type ThemeTokens } from "@/lib/theme/tokens";

export type Branding = { id: string; slug: string; name: string; logo_path: string | null; tokens: ThemeTokens | null };

/** Public branding for an organization, readable before sign-in. */
export const getBranding = cache(async (slug: string): Promise<Branding | null> => {
  const db = await createUserClient();
  const { data, error } = await db.rpc("get_branding", { p_slug: slug });
  if (error || !data) return null;
  const raw = data as { id: string; slug: string; name: string; logo_path: string | null; tokens: unknown };
  const parsed = themeTokensSchema.safeParse(raw.tokens);
  return { id: raw.id, slug: raw.slug, name: raw.name, logo_path: raw.logo_path, tokens: parsed.success ? parsed.data : null };
});

/** For pages under an organization: its branding, or "Page not found". */
export async function requireBranding(slug: string): Promise<Branding> {
  const branding = await getBranding(slug);
  if (!branding) notFound();
  return branding;
}
