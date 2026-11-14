import { z } from "zod";
import { adjustForContrast, contrastRatio, isHex, mix, readableOn } from "./color";

export const APPROVED_FONTS = [
  "Inter",
  "IBM Plex Sans",
  "Source Sans 3",
  "Nunito Sans",
  "Work Sans",
  "Merriweather",
  "Source Serif 4",
  "Lora",
] as const;
export type ApprovedFont = (typeof APPROVED_FONTS)[number];

const hex = z.string().refine(isHex, "Must be a hex color such as #1a2b3c");

export const modeTokensSchema = z.object({
  primary: hex,
  accent: hex,
  background: hex,
  surface: hex,
  text: hex,
  muted: hex,
  chart: z.array(hex).length(5),
});

export const themeTokensSchema = z.object({
  light: modeTokensSchema,
  dark: modeTokensSchema,
  radius: z.number().int().min(0).max(24),
  heading_font: z.enum(APPROVED_FONTS),
  body_font: z.enum(APPROVED_FONTS),
});

export type ModeTokens = z.infer<typeof modeTokensSchema>;
export type ThemeTokens = z.infer<typeof themeTokensSchema>;
export type Mode = "light" | "dark";

/** Colors the code derives from the tokens. None of them is chosen by a model. */
export function derived(t: ModeTokens, mode: Mode) {
  return {
    on_primary: readableOn(t.primary),
    on_accent: readableOn(t.accent),
    border: mix(t.background, t.text, mode === "light" ? 0.16 : 0.22),
    primary_soft: mix(t.surface, t.primary, mode === "light" ? 0.1 : 0.2),
    danger: adjustForContrast(mode === "light" ? "#b42318" : "#f97066", t.surface) ?? t.text,
    success: adjustForContrast(mode === "light" ? "#067647" : "#47cd89", t.surface) ?? t.text,
  };
}

export type ContrastPair = { mode: Mode; foreground: keyof ModeTokens | "on_primary" | "on_accent"; background: keyof ModeTokens; ratio: number };

/** Every text and background pair the interface uses. Each must reach 4.5:1. */
export const TEXT_PAIRS: Array<[ContrastPair["foreground"], ContrastPair["background"]]> = [
  ["text", "background"],
  ["text", "surface"],
  ["muted", "background"],
  ["muted", "surface"],
  ["primary", "background"],
  ["primary", "surface"],
  ["on_primary", "primary"],
  ["on_accent", "accent"],
];

export const MIN_CONTRAST = 4.5;

export function contrastPairs(tokens: ThemeTokens): ContrastPair[] {
  const out: ContrastPair[] = [];
  for (const mode of ["light", "dark"] as const) {
    const t = tokens[mode];
    const d = derived(t, mode);
    for (const [fg, bg] of TEXT_PAIRS) {
      const fgColor = fg === "on_primary" ? d.on_primary : fg === "on_accent" ? d.on_accent : (t[fg] as string);
      out.push({ mode, foreground: fg, background: bg, ratio: contrastRatio(fgColor, t[bg] as string) });
    }
  }
  return out;
}

export function failingPairs(tokens: ThemeTokens): ContrastPair[] {
  return contrastPairs(tokens).filter((p) => p.ratio < MIN_CONTRAST);
}

const fontVar: Record<ApprovedFont, string> = {
  Inter: "--font-inter",
  "IBM Plex Sans": "--font-ibm-plex-sans",
  "Source Sans 3": "--font-source-sans-3",
  "Nunito Sans": "--font-nunito-sans",
  "Work Sans": "--font-work-sans",
  Merriweather: "--font-merriweather",
  "Source Serif 4": "--font-source-serif-4",
  Lora: "--font-lora",
};

function fontStack(font: ApprovedFont): string {
  const serif = font === "Merriweather" || font === "Source Serif 4" || font === "Lora";
  return `var(${fontVar[font]}), ${serif ? "ui-serif, Georgia, serif" : "ui-sans-serif, system-ui, sans-serif"}`;
}

function modeVars(t: ModeTokens, mode: Mode): string {
  const d = derived(t, mode);
  const vars: Record<string, string> = {
    "--primary": t.primary,
    "--accent": t.accent,
    "--background": t.background,
    "--surface": t.surface,
    "--text": t.text,
    "--muted": t.muted,
    "--on-primary": d.on_primary,
    "--on-accent": d.on_accent,
    "--border": d.border,
    "--primary-soft": d.primary_soft,
    "--danger": d.danger,
    "--success": d.success,
  };
  t.chart.forEach((c, i) => (vars[`--chart-${i + 1}`] = c));
  return Object.entries(vars).map(([k, v]) => `${k}:${v};`).join("");
}

/**
 * The CSS for one theme, scoped to `selector`. Light and dark follow the system setting.
 * Values are validated hex colors and numbers, so they are safe to inline.
 */
export function themeCss(tokens: ThemeTokens, selector: string): string {
  const parsed = themeTokensSchema.parse(tokens);
  const shared = `--t-radius:${parsed.radius}px;--t-font-heading:${fontStack(parsed.heading_font)};--t-font-body:${fontStack(parsed.body_font)};`;
  return (
    `${selector}{${shared}${modeVars(parsed.light, "light")}color-scheme:light;}` +
    `@media (prefers-color-scheme: dark){${selector}{${modeVars(parsed.dark, "dark")}color-scheme:dark;}}`
  );
}

/** The platform's own neutral theme, used where no organization theme applies. */
export const PLATFORM_THEME: ThemeTokens = {
  light: {
    primary: "#2f5d50",
    accent: "#8a5a12",
    background: "#f6f5f2",
    surface: "#ffffff",
    text: "#1d1b18",
    muted: "#5f5a52",
    chart: ["#2f5d50", "#c0832b", "#4f6fa8", "#a8505f", "#6b8f3a"],
  },
  dark: {
    primary: "#84bba7",
    accent: "#e2b46a",
    background: "#141311",
    surface: "#1d1c19",
    text: "#ece8e1",
    muted: "#aaa398",
    chart: ["#84bba7", "#e2b46a", "#8fa9db", "#dc8f9c", "#a9c97c"],
  },
  radius: 8,
  heading_font: "Inter",
  body_font: "Inter",
};

/** CSS for one mode only, for previews that show light and dark side by side. */
export function previewCss(tokens: ThemeTokens, mode: Mode, selector: string): string {
  const shared = `--t-radius:${tokens.radius}px;--t-font-heading:${fontStack(tokens.heading_font)};--t-font-body:${fontStack(tokens.body_font)};`;
  return `${selector}{${shared}${modeVars(tokens[mode], mode)}color-scheme:${mode};}`;
}
