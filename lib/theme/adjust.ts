import { adjustForContrast, contrastRatio, readableOn } from "./color";
import { failingPairs, MIN_CONTRAST, type ContrastPair, type Mode, type ThemeTokens } from "./tokens";

export type Adjustment = { mode: Mode; token: string; from: string; to: string };

/**
 * Adjusts a proposed theme until every text and background pair reaches 4.5:1, keeping each
 * color's hue and moving only its lightness. Returns what changed and anything still failing,
 * in which case the proposal is rejected.
 */
export function adjustTheme(input: ThemeTokens): { tokens: ThemeTokens; adjustments: Adjustment[]; failing: ContrastPair[] } {
  const tokens: ThemeTokens = JSON.parse(JSON.stringify(input));
  const adjustments: Adjustment[] = [];
  const set = (mode: Mode, token: "text" | "muted" | "primary" | "accent", to: string | null) => {
    const from = tokens[mode][token];
    if (to && to !== from) {
      tokens[mode][token] = to;
      adjustments.push({ mode, token, from, to });
    }
  };
  for (let pass = 0; pass < 4; pass++) {
    for (const mode of ["light", "dark"] as const) {
      const t = tokens[mode];
      // Buttons: the primary and accent must carry readable text (white or near-black).
      for (const token of ["primary", "accent"] as const) {
        const onIt = readableOn(t[token]);
        if (contrastRatio(onIt, t[token]) < MIN_CONTRAST) set(mode, token, adjustForContrast(t[token], onIt));
      }
      // Text, muted text and links on both the page background and cards.
      for (const token of ["text", "muted", "primary"] as const) {
        for (const bg of ["background", "surface"] as const) {
          if (contrastRatio(tokens[mode][token], tokens[mode][bg]) < MIN_CONTRAST) set(mode, token, adjustForContrast(tokens[mode][token], tokens[mode][bg]));
        }
      }
    }
    if (!failingPairs(tokens).length) break;
  }
  return { tokens, adjustments, failing: failingPairs(tokens) };
}
