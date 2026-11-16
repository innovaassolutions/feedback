import { createHash } from "node:crypto";
import { publicEnv } from "@/lib/env";
import type { AdminClient } from "@/lib/server/supabase-admin";
import { PLATFORM_THEME, themeTokensSchema, type ThemeTokens } from "@/lib/theme/tokens";
import { EMAIL_LOGO_HEIGHT, emailLogo } from "./logo";

/** What an email needs to look like its organization: its name, live theme and logo. */
export type EmailBrand = {
  name: string;
  tokens: ThemeTokens;
  logo: { url: string; width: number; height: number } | null;
  /** False for the platform's own look, used when no single organization applies. */
  organization: boolean;
};

export const PLATFORM_BRAND: EmailBrand = { name: "Course Feedback Platform", tokens: PLATFORM_THEME, logo: null, organization: false };

type BrandingRow = { id: string; slug: string; name: string; logo_path: string | null; tokens: unknown };

/** The same public branding the organization's pages use. */
async function brandingBySlug(admin: AdminClient, slug: string): Promise<BrandingRow | null> {
  const { data, error } = await admin.rpc("get_branding", { p_slug: slug });
  if (error || !data) return null;
  return data as BrandingRow;
}

async function brandOf(admin: AdminClient, row: BrandingRow): Promise<EmailBrand> {
  const parsed = themeTokensSchema.safeParse(row.tokens);
  const logo = row.logo_path ? await emailLogo(admin, row.logo_path) : null;
  // The version changes with the logo file, so a new logo isn't hidden by a cached old one.
  const version = row.logo_path ? createHash("sha256").update(row.logo_path).digest("hex").slice(0, 10) : "";
  return {
    name: row.name,
    // An organization without an approved theme yet keeps its name and logo on the platform's colors.
    tokens: parsed.success ? parsed.data : PLATFORM_THEME,
    logo: logo
      ? {
          url: `${publicEnv.appUrl}/api/email-logo/${row.slug}.png?v=${version}`,
          width: Math.round((EMAIL_LOGO_HEIGHT * logo.width) / logo.height),
          height: EMAIL_LOGO_HEIGHT,
        }
      : null,
    organization: true,
  };
}

/** The PNG behind an organization's email logo, for /api/email-logo. */
export async function emailLogoBySlug(admin: AdminClient, slug: string) {
  const row = await brandingBySlug(admin, slug);
  return row?.logo_path ? emailLogo(admin, row.logo_path) : null;
}

export async function brandForOrganization(admin: AdminClient, organizationId: string): Promise<EmailBrand> {
  const { data: org } = await admin.from("organizations").select("slug").eq("id", organizationId).maybeSingle();
  const row = org ? await brandingBySlug(admin, org.slug) : null;
  return row ? brandOf(admin, row) : PLATFORM_BRAND;
}

/** Looks each organization up once, for jobs that email many people. */
export function brandCache(admin: AdminClient): (organizationId: string) => Promise<EmailBrand> {
  const brands = new Map<string, Promise<EmailBrand>>();
  return (organizationId) => {
    let brand = brands.get(organizationId);
    if (!brand) {
      brand = brandForOrganization(admin, organizationId);
      brands.set(organizationId, brand);
    }
    return brand;
  };
}

/** The organization a path such as /streamspace/ime-engineering belongs to, if it names one. */
function slugOf(path: string | null): string | null {
  const first = path?.split(/[?#]/)[0].split("/").filter(Boolean)[0];
  return first && /^[a-z0-9-]+$/.test(first) ? first : null;
}

/**
 * The brand for a sign-in email. The organization of the page the person signed in from, when
 * they belong to it; otherwise their only organization; otherwise the platform's own look. An
 * email never shows an organization the person isn't part of, so it can't reveal one:
 * `otherOrganization` says the page belongs to one, and the link then leaves that page out.
 */
export async function brandForSignIn(
  admin: AdminClient,
  user: { id: string; platformAdmin: boolean },
  nextPath: string | null,
): Promise<{ brand: EmailBrand; otherOrganization: boolean }> {
  const [{ data: staff }, { data: learner }] = await Promise.all([
    admin.from("memberships").select("organization_id").eq("user_id", user.id),
    admin.from("enrollments").select("organization_id").eq("user_id", user.id),
  ]);
  const organizations = new Set([...(staff ?? []), ...(learner ?? [])].map((r) => r.organization_id));

  let otherOrganization = false;
  const slug = slugOf(nextPath);
  if (slug) {
    const row = await brandingBySlug(admin, slug);
    if (row && (user.platformAdmin || organizations.has(row.id))) return { brand: await brandOf(admin, row), otherOrganization };
    otherOrganization = row !== null;
  }
  const brand = organizations.size === 1 ? await brandForOrganization(admin, [...organizations][0]) : PLATFORM_BRAND;
  return { brand, otherOrganization };
}
