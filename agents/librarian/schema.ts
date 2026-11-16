import { z } from "zod";

export const briefSchema = z.object({
  objectives: z.array(z.string().min(1).max(300)).min(1).max(8),
  topics: z.array(z.string().min(1).max(200)).min(1).max(12),
  known_issues: z.array(z.string().min(1).max(300)).max(8),
});
export type Brief = z.infer<typeof briefSchema>;

/**
 * What the model is asked for. A long document can yield a thirteenth topic or a long line, and a
 * strict schema then fails the whole draft, so the model's draft is accepted loosely and
 * fitted to the brief's limits in code (tidyBrief).
 */
export const briefDraftSchema = z.object({
  objectives: z.array(z.string()),
  topics: z.array(z.string()),
  known_issues: z.array(z.string()),
});

/** Shortens text at a word boundary. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function tidy(items: string[], max: number, length: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = clip(raw.replace(/\s+/g, " ").trim().replace(/^[-•*]\s*/, ""), length);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length === max) break;
  }
  return out;
}

/** Fits a draft to the brief's limits. Null when it has no objective or no topic left. */
export function tidyBrief(draft: z.infer<typeof briefDraftSchema>): Brief | null {
  const brief = {
    objectives: tidy(draft.objectives, 8, 300),
    topics: tidy(draft.topics, 12, 200),
    known_issues: tidy(draft.known_issues, 8, 300),
  };
  return briefSchema.safeParse(brief).success ? brief : null;
}

export const answerSchema = z.object({
  answerable: z.boolean(),
  answer: z.string().max(3000),
  citations: z.array(z.string()).max(12),
  sources_disagree: z.boolean(),
});
export type LibrarianAnswer = z.infer<typeof answerSchema>;
