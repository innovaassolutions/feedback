import { THEMES, type AnalystOutput, type Insight, type Theme } from "./schema";

export class AnalystValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalystValidationError";
  }
}

const isTheme = (t: string): t is Theme => (THEMES as readonly string[]).includes(t);

export function normalizeForQuote(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True if the quote appears word for word in one of the learner's turns. */
export function isVerbatim(quote: string, learnerTurns: string[]): boolean {
  const q = normalizeForQuote(quote).replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "").replace(/[.,;:!?…]+$/, "");
  if (q.length < 3) return false;
  return learnerTurns.some((t) => normalizeForQuote(t).includes(q));
}

/**
 * Checks the Analyst's output in code. A theme outside the fixed list fails validation. A quote
 * that isn't in the learner's own words is dropped. Private interviews keep no quotes.
 */
export function checkAnalystOutput(out: AnalystOutput, learnerTurns: string[], opts: { private: boolean }): { insight: Insight; droppedQuotes: number } {
  for (const t of out.themes) if (!isTheme(t.theme)) throw new AnalystValidationError("theme outside the list");
  for (const q of out.quotes) if (!isTheme(q.theme)) throw new AnalystValidationError("quote theme outside the list");
  for (const p of out.paraphrases) if (!isTheme(p.theme)) throw new AnalystValidationError("paraphrase theme outside the list");

  const seen = new Set<string>();
  const themes = out.themes.filter((t) => (seen.has(t.theme) ? false : (seen.add(t.theme), true))) as Insight["themes"];
  const verbatim = out.quotes.filter((q) => isVerbatim(q.text, learnerTurns)) as Insight["quotes"];
  const quotes = opts.private ? [] : verbatim.slice(0, 3);
  return {
    insight: {
      themes,
      blockers: out.blockers.map((b) => b.trim()).filter(Boolean),
      suggestions: out.suggestions.map((s) => s.trim()).filter(Boolean),
      quotes,
      paraphrases: out.paraphrases as Insight["paraphrases"],
    },
    droppedQuotes: out.quotes.length - quotes.length,
  };
}
