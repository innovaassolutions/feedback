import { z } from "zod";

/** What the Interviewer returns on each learner turn in the ratings and conversation stages. */
export const turnOutputSchema = z.object({
  reply: z.string().min(1).max(1200),
  topic_action: z.enum(["follow_up", "next_topic", "stay"]),
  learner_declined: z.boolean(),
  offered_to_post_question: z.boolean(),
});
export type TurnOutput = z.infer<typeof turnOutputSchema>;

/** The read-back: three to five points for the learner to check. */
export const readBackSchema = z.object({
  points: z.array(z.string().min(3).max(400)).min(1).max(5),
});

export const STAGES = ["consent", "ratings", "conversation", "read_back", "done"] as const;
export type Stage = (typeof STAGES)[number];

export type TopicState = { id: string; status: "pending" | "asked" | "followed_up" | "covered" | "skipped" };

/** Code-tracked progress, stored on the interview. The model never writes it directly. */
export type Progress = {
  rating_items: string[];
  current_item: string | null;
  clarified: string[];
  topics: TopicState[];
  current_topic: string | null;
  last_offer: boolean;
  proposed_summary: string[] | null;
  blockers_flagged: number;
  questions_raised: number;
  /** The learner turn at which the read-back began, for the rubric's limits check. */
  read_back_turn?: number | null;
};

export const STAGE_LABEL: Record<Stage, string> = {
  consent: "Consent",
  ratings: "Ratings",
  conversation: "Conversation",
  read_back: "Summary",
  done: "Done",
};
