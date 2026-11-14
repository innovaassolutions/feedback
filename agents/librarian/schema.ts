import { z } from "zod";

export const briefSchema = z.object({
  objectives: z.array(z.string().min(1).max(300)).min(1).max(8),
  topics: z.array(z.string().min(1).max(200)).min(1).max(12),
  known_issues: z.array(z.string().min(1).max(300)).max(8),
});
export type Brief = z.infer<typeof briefSchema>;

export const answerSchema = z.object({
  answerable: z.boolean(),
  answer: z.string().max(3000),
  citations: z.array(z.string()).max(12),
  sources_disagree: z.boolean(),
});
export type LibrarianAnswer = z.infer<typeof answerSchema>;
