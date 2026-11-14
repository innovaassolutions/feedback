// Every number on the dashboard is computed here, from rows, in code. Cohorts are small, so each
// figure carries its count as well as its percentage.

import { PREFER_NOT_TO_SAY } from "@/lib/guide";

export type RatingRow = { item_id: string; choice: string };
export type ThemeRow = { theme: string; sentiment: string };
export type Fraction = { count: number; of: number; pct: number | null };

export const NPS_MIN_RESPONSES = 10;
export const ABLE_CHOICES = ["yes_without_help", "yes_with_guide"];

export function fraction(count: number, of: number): Fraction {
  return { count, of, pct: of > 0 ? Math.round((count / of) * 100) : null };
}

export function choicesFor(rows: RatingRow[], item: string): string[] {
  return rows.filter((r) => r.item_id === item).map((r) => r.choice);
}

/** Counts per choice, in the order given, plus "Prefer not to say". */
export function spread(rows: RatingRow[], item: string, order: string[]): Array<{ choice: string; count: number }> {
  const answers = choicesFor(rows, item);
  return [...order, PREFER_NOT_TO_SAY].map((choice) => ({ choice, count: answers.filter((a) => a === choice).length }));
}

export function responseRate(responses: number, enrolled: number): Fraction {
  return fraction(responses, enrolled);
}

/** Learners who chose either "Yes" answer to the ability item, out of all responses. */
export function ableToApply(rows: RatingRow[], responses: number): Fraction {
  return fraction(choicesFor(rows, "ability").filter((c) => ABLE_CHOICES.includes(c)).length, responses);
}

export function paceAboutRight(rows: RatingRow[], responses: number): Fraction {
  return fraction(choicesFor(rows, "pace").filter((c) => c === "about_right").length, responses);
}

export type RecommendSummary = { average: number | null; answered: number; min: number | null; max: number | null };

/** The average of the 0–10 answers, to one decimal place, with the range. */
export function recommend(rows: RatingRow[]): RecommendSummary {
  const scores = choicesFor(rows, "recommend").filter((c) => c !== PREFER_NOT_TO_SAY).map(Number).filter((n) => Number.isFinite(n));
  if (!scores.length) return { average: null, answered: 0, min: null, max: null };
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { average: Math.round(avg * 10) / 10, answered: scores.length, min: Math.min(...scores), max: Math.max(...scores) };
}

/** Net Promoter Score, shown only at ten or more answers: % of 9–10 minus % of 0–6. */
export function netPromoterScore(rows: RatingRow[]): number | null {
  const scores = choicesFor(rows, "recommend").filter((c) => c !== PREFER_NOT_TO_SAY).map(Number).filter((n) => Number.isFinite(n));
  if (scores.length < NPS_MIN_RESPONSES) return null;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

export const THEME_ORDER = [
  "Content and relevance",
  "Pace and timing",
  "Instructor delivery",
  "Hands-on practice",
  "Materials and documentation",
  "Platform and access",
  "Logistics",
  "Support and follow-up",
];

/** Positive and negative mentions per theme. A mixed mention counts once on each side. */
export function themeMentions(rows: ThemeRow[]): Array<{ theme: string; positive: number; negative: number }> {
  return THEME_ORDER.map((theme) => {
    const mine = rows.filter((r) => r.theme === theme);
    return {
      theme,
      positive: mine.filter((r) => r.sentiment === "positive" || r.sentiment === "mixed").length,
      negative: mine.filter((r) => r.sentiment === "negative" || r.sentiment === "mixed").length,
    };
  }).filter((t) => t.positive + t.negative > 0);
}

/** Learners who said they've used it at work, from the follow-up interview. */
export function appliedAtWork(rows: RatingRow[], responses: number): Fraction {
  return fraction(choicesFor(rows, "applied").filter((c) => c === "yes_regularly" || c === "yes_once_or_twice").length, responses);
}

/** The numbers a session summary may mention. Anything else in the text means it is rewritten. */
export function allowedNumbers(values: Array<number | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    out.add(String(v));
    out.add(String(Math.round(v)));
    if (!Number.isInteger(v)) out.add(v.toFixed(1));
  }
  return out;
}

const NUMBER_WORDS: Record<string, number> = {
  // "one" is left out: it is far more often a pronoun ("no one", "one of them") than a count.
  zero: 0, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  half: -1, third: -1, quarter: -1, dozen: 12,
};

/** Every number in a text, as written in digits or words. Fractions in words always fail. */
export function numbersIn(text: string): string[] {
  const found = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
  for (const m of text.toLowerCase().matchAll(/\b[a-z]+\b/g)) {
    const n = NUMBER_WORDS[m[0]];
    if (n !== undefined) found.push(n < 0 ? "fraction" : String(n));
  }
  return found;
}

export function onlyAllowedNumbers(text: string, allowed: Set<string>): boolean {
  return numbersIn(text).every((n) => allowed.has(n));
}

export type QuestionRow = { state: string; created_at: string; first_answered_at: string | null; sent_to_instructor_at: string | null };
export type QaStats = { open: number; answered: number; median_minutes: number | null; sent_to_instructor: number };

/** Open against answered, the median time to a first answer, and how many went to the instructor. */
export function qaStats(rows: QuestionRow[]): QaStats {
  const answered = rows.filter((r) => r.state === "ai_answered" || r.state === "answered");
  const times = answered
    .filter((r) => r.first_answered_at)
    .map((r) => (new Date(r.first_answered_at!).getTime() - new Date(r.created_at).getTime()) / 60_000)
    .sort((a, b) => a - b);
  let median: number | null = null;
  if (times.length) {
    const mid = Math.floor(times.length / 2);
    median = times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
    median = Math.round(median * 10) / 10;
  }
  return {
    open: rows.length - answered.length,
    answered: answered.length,
    median_minutes: median,
    sent_to_instructor: rows.filter((r) => r.sent_to_instructor_at !== null || r.state === "needs_instructor").length,
  };
}

export function formatMinutes(m: number | null): string {
  if (m === null) return "—";
  if (m < 1) return "under a minute";
  if (m < 90) return `${Math.round(m)} min`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} days`;
}
