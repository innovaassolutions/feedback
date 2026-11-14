import { readFileSync } from "node:fs";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { approveTheme, proposeTheme } from "@/lib/server/ops/themes";
import { proposalSchema } from "@/agents/brand-designer/schema";
import { adjustTheme } from "@/lib/theme/adjust";
import { failingPairs, themeTokensSchema, type ThemeTokens } from "@/lib/theme/tokens";
import { hueOf } from "@/lib/theme/color";
import { NORTHWIND_THEME } from "@/lib/server/seed";
import { seeded, sql } from "./support/db";
import { ctxAs, statusOf, type TestCtx } from "./support/ctx";
import { fileOf } from "./support/fixtures";

let ids: Awaited<ReturnType<typeof seeded>>;
let owen: TestCtx;
let bluePng: Uint8Array;
beforeAll(async () => {
  ids = await seeded();
  owen = await ctxAs("owen");
  bluePng = new Uint8Array(
    await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
      .composite([{ input: await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 29, g: 95, b: 209, alpha: 1 } } }).png().toBuffer(), top: 12, left: 12 }])
      .png()
      .toBuffer(),
  );
});

describe("logos", () => {
  it("accepts a PNG or SVG up to 2 MB, and refuses anything else with 422", async () => {
    const png = await proposeTheme(owen, { organization_id: ids.northwind, logo: fileOf(bluePng, "logo.png", "image/png") });
    expect(png.theme.status).toBe("proposed");
    const svg = await proposeTheme(owen, { organization_id: ids.northwind, logo: fileOf(readFileSync("scripts/assets/northwind-logo.svg"), "logo.svg", "image/svg+xml") });
    expect(svg.theme.status).toBe("proposed");

    const jpeg = new Uint8Array(await sharp(Buffer.from(bluePng)).jpeg().toBuffer());
    expect(await statusOf(proposeTheme(owen, { organization_id: ids.northwind, logo: fileOf(jpeg, "logo.jpg", "image/jpeg") }))).toBe(422);
    expect(await statusOf(proposeTheme(owen, { organization_id: ids.northwind, logo: fileOf(jpeg, "logo.png", "image/png") }))).toBe(422);
    const big = new Uint8Array(2 * 1024 * 1024 + 10);
    big.set(bluePng);
    expect(await statusOf(proposeTheme(owen, { organization_id: ids.northwind, logo: fileOf(big, "big.png", "image/png") }))).toBe(422);
    const scripted = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>';
    expect(await statusOf(proposeTheme(owen, { organization_id: ids.northwind, logo: fileOf(scripted, "x.svg", "image/svg+xml") }))).toBe(422);
  });

  it("only an organization admin can propose a theme", async () => {
    expect(await statusOf(proposeTheme(await ctxAs("isla"), { organization_id: ids.northwind, logo: fileOf(bluePng, "logo.png") }))).toBe(403);
    expect(await statusOf(proposeTheme(await ctxAs("dana"), { organization_id: ids.northwind, logo: fileOf(bluePng, "logo.png") }))).toBe(404);
  });
});

describe("the Brand designer", () => {
  it("proposes every token for light and dark mode, passing the schema and the contrast check", async () => {
    const { theme } = await proposeTheme(owen, { organization_id: ids.northwind, logo: fileOf(bluePng, "logo.png", "image/png") });
    const tokens = proposalSchema.parse(theme.tokens);
    for (const mode of ["light", "dark"] as const) {
      expect(Object.keys(tokens[mode]).sort()).toEqual(["accent", "background", "chart", "muted", "primary", "surface", "text"]);
      expect(tokens[mode].chart).toHaveLength(5);
    }
    expect(failingPairs(tokens)).toEqual([]);
    // The stub takes the primary from the logo: a blue.
    expect(Math.abs(hueOf(tokens.light.primary) - 218)).toBeLessThan(15);
    const runs = await sql()`select agent, outcome from public.agent_runs where agent = 'brand_designer' and organization_id = ${ids.northwind}`;
    expect(runs.length).toBeGreaterThan(0);
  });
});

describe("contrast", () => {
  const failing: ThemeTokens = {
    ...NORTHWIND_THEME,
    light: { ...NORTHWIND_THEME.light, muted: "#bbbbbb", primary: "#9fd3a8" },
    dark: { ...NORTHWIND_THEME.dark, text: "#555555" },
  };

  it("a proposal with a pair under 4.5:1 is adjusted until it passes", () => {
    expect(failingPairs(failing).length).toBeGreaterThan(0);
    const { tokens, adjustments, failing: still } = adjustTheme(failing);
    expect(still).toEqual([]);
    expect(failingPairs(tokens)).toEqual([]);
    expect(adjustments.map((a) => `${a.mode}.${a.token}`).sort()).toEqual(expect.arrayContaining(["dark.text", "light.muted", "light.primary"]));
    // Lightness moves; the hue stays.
    expect(Math.abs(hueOf(tokens.light.primary) - hueOf("#9fd3a8"))).toBeLessThan(6);
  });

  it("approve_theme with a failing pair returns 422", async () => {
    const { theme } = await proposeTheme(owen, { organization_id: ids.northwind, logo: fileOf(bluePng, "logo.png", "image/png") });
    expect(await statusOf(approveTheme(owen, { theme_id: theme.id, tokens: themeTokensSchema.parse(failing) }))).toBe(422);
  });
});

describe("theme history", () => {
  it("approving makes a theme live and keeps the earlier one; restoring the earlier one makes it live again", async () => {
    const [before] = await sql()`select live_theme_id from public.organizations where id = ${ids.northwind}`;
    const [seededTheme] = await sql()`select id, tokens from public.themes where id = ${before.live_theme_id}`;
    const { theme } = await proposeTheme(owen, { organization_id: ids.northwind, logo: fileOf(bluePng, "logo.png", "image/png") });
    await approveTheme(owen, { theme_id: theme.id, tokens: themeTokensSchema.parse(theme.tokens) });
    let [org] = await sql()`select live_theme_id, logo_path from public.organizations where id = ${ids.northwind}`;
    expect(org.live_theme_id).toBe(theme.id);
    expect(org.logo_path).toBe(theme.logo_path);
    const [old] = await sql()`select status from public.themes where id = ${seededTheme.id}`;
    expect(old.status).toBe("archived");

    await approveTheme(owen, { theme_id: seededTheme.id, tokens: themeTokensSchema.parse(seededTheme.tokens) });
    [org] = await sql()`select live_theme_id from public.organizations where id = ${ids.northwind}`;
    expect(org.live_theme_id).toBe(seededTheme.id);
    const statuses = await sql()`select id, status from public.themes where organization_id = ${ids.northwind} and status = 'live'`;
    expect(statuses.map((s) => s.id)).toEqual([seededTheme.id]);
  });
});
