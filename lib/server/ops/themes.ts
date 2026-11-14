import type { Ctx } from "@/lib/server/ctx";
import { requireUser } from "@/lib/server/ctx";
import type { OperationInput } from "@/lib/operations";
import { forbidden, notFound, unprocessable } from "@/lib/server/http";
import { MAX_LOGO_BYTES, detectLogoKind, svgLooksUnsafe } from "@/lib/files";
import { failingPairs, type ThemeTokens } from "@/lib/theme/tokens";
import { adjustTheme } from "@/lib/theme/adjust";
import type { Json } from "@/lib/database.types";
import { languageModel } from "@/lib/server/ai/models";
import { modelIdFor } from "@/lib/server/ai/provider";
import { loadAgentFile } from "@/lib/server/ai/agent-file";
import { recordRun } from "@/lib/server/ai/runs";
import { proposeFromLogo } from "@/agents/brand-designer/propose";

async function requireOrgAdmin(ctx: Ctx, organizationId: string) {
  requireUser(ctx);
  const { data: org } = await ctx.db.from("organizations").select("id, slug, logo_path").eq("id", organizationId).maybeSingle();
  if (!org) throw notFound("Organization not found");
  const { data: admin } = await ctx.db.rpc("is_org_admin", { org: org.id });
  if (!admin) throw forbidden("Only organization admins can change branding");
  return org;
}

/** Checks a logo file: PNG or SVG, up to 2 MB, and no scripts in an SVG. */
export function checkLogo(name: string, bytes: Uint8Array): "png" | "svg" {
  if (bytes.byteLength > MAX_LOGO_BYTES) throw unprocessable("Logos can be up to 2 MB");
  const kind = detectLogoKind(name, bytes);
  if (!kind) throw unprocessable("Upload the logo as a PNG or SVG file");
  if (kind === "svg" && svgLooksUnsafe(bytes)) throw unprocessable("This SVG contains scripts or embedded content. Export a plain SVG or a PNG.");
  return kind;
}

/** Stores a logo in the public logos bucket and returns its path. */
export async function storeLogo(ctx: Ctx, organizationId: string, file: File): Promise<{ path: string; bytes: Uint8Array }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = checkLogo(file.name, bytes);
  const path = `${organizationId}/${crypto.randomUUID()}.${kind}`;
  const up = await ctx.db.storage.from("logos").upload(path, bytes, { contentType: kind === "png" ? "image/png" : "image/svg+xml", upsert: false });
  if (up.error) throw new Error(`store logo: ${up.error.message}`);
  return { path, bytes };
}

/**
 * The Brand designer proposes a theme from a logo. Code then adjusts every text and background
 * pair to 4.5:1, or rejects the proposal. Nothing goes live until an admin approves it.
 */
export async function proposeTheme(ctx: Ctx, input: OperationInput<"propose_theme">) {
  const org = await requireOrgAdmin(ctx, input.organization_id);
  const { path, bytes } = await storeLogo(ctx, org.id, input.logo);
  return proposeFromStoredLogo(ctx, org.id, path, bytes);
}

export async function proposeFromStoredLogo(ctx: Ctx, organizationId: string, logoPath: string, bytes: Uint8Array) {
  const agent = loadAgentFile("brand-designer");
  const { tokens, run } = await proposeFromLogo({ model: languageModel("brand_designer"), instructions: agent.instructions }, bytes);
  await recordRun(
    ctx.admin,
    { organizationId, agent: "brand_designer", agentVersion: agent.version, model: modelIdFor("brand_designer"), operation: "propose_theme" },
    { outcome: run.outcome, usage: run.usage, providerMetadata: run.providerMetadata, latencyMs: run.latencyMs, error: run.error },
  );
  if (!tokens) throw unprocessable("The Brand designer couldn't propose a theme from this logo. Try again, or try another version of the logo.");
  const adjusted = adjustTheme(tokens);
  if (adjusted.failing.length) throw unprocessable("We couldn't make a readable theme from this logo. Try another version of it.", { failing: adjusted.failing });
  const { data, error } = await ctx.db
    .from("themes")
    .insert({
      organization_id: organizationId,
      status: "proposed",
      tokens: adjusted.tokens as unknown as Json,
      logo_path: logoPath,
      source: "brand_designer",
      adjustments: adjusted.adjustments as unknown as Json,
      created_by: ctx.user!.id,
    })
    .select("id, tokens, logo_path, adjustments, status")
    .single();
  if (error) throw new Error(`save proposal: ${error.message}`);
  return { theme: data };
}

/**
 * Makes a theme live for the organization. A theme with any text and background pair under
 * 4.5:1 is refused. Approving an earlier theme restores it.
 */
export async function approveTheme(ctx: Ctx, input: OperationInput<"approve_theme">) {
  requireUser(ctx);
  const { data: theme } = await ctx.db.from("themes").select("id, organization_id, logo_path").eq("id", input.theme_id).maybeSingle();
  if (!theme) throw notFound("Theme not found");
  const org = await requireOrgAdmin(ctx, theme.organization_id);
  const failing = failingPairs(input.tokens as ThemeTokens);
  if (failing.length) throw unprocessable("Some text wouldn't be readable: every text and background pair needs a contrast of at least 4.5:1", { failing });
  const now = ctx.now().toISOString();
  await ctx.db.from("themes").update({ status: "archived" }).eq("organization_id", org.id).eq("status", "live").neq("id", theme.id);
  const { error } = await ctx.db
    .from("themes")
    .update({ status: "live", tokens: input.tokens as unknown as Json, approved_by: ctx.user!.id, approved_at: now })
    .eq("id", theme.id);
  if (error) throw new Error(`approve: ${error.message}`);
  const { error: orgError } = await ctx.db
    .from("organizations")
    .update({ live_theme_id: theme.id, logo_path: theme.logo_path ?? org.logo_path })
    .eq("id", org.id);
  if (orgError) throw new Error(`set live theme: ${orgError.message}`);
  return { theme_id: theme.id, status: "live" };
}
