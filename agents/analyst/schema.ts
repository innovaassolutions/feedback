import { z } from "zod";

export const THEMES = [
  "Content and relevance",
  "Pace and timing",
  "Instructor delivery",
  "Hands-on practice",
  "Materials and documentation",
  "Platform and access",
  "Logistics",
  "Support and follow-up",
] as const;
export type Theme = (typeof THEMES)[number];
export const SENTIMENTS = ["positive", "negative", "mixed"] as const;

// The model's output is parsed loosely, then checked in code. A theme outside the list is a
// validation failure that code counts and retries, not something the schema hides.
export const analystOutputSchema = z.object({
  themes: z.array(z.object({ theme: z.string(), sentiment: z.enum(SENTIMENTS), paraphrase: z.string().max(400) })).max(12),
  blockers: z.array(z.string().max(300)).max(8),
  suggestions: z.array(z.string().max(300)).max(8),
  quotes: z.array(z.object({ text: z.string().max(600), theme: z.string() })).max(6),
  paraphrases: z.array(z.object({ text: z.string().max(400), theme: z.string() })).max(10),
});
export type AnalystOutput = z.infer<typeof analystOutputSchema>;

export type Insight = {
  themes: Array<{ theme: Theme; sentiment: (typeof SENTIMENTS)[number]; paraphrase: string }>;
  blockers: string[];
  suggestions: string[];
  quotes: Array<{ text: string; theme: Theme }>;
  paraphrases: Array<{ text: string; theme: Theme }>;
};

/** The session summary the Analyst writes for the dashboard. */
export const sessionSummarySchema = z.object({ summary: z.string().min(1).max(1500) });
