import { z } from "zod";

// The interview guide: rating items with concrete choices, and the conversation topics.
// Performance-focused questions (Thalheimer) rather than agree/disagree scales.

export const PREFER_NOT_TO_SAY = "prefer_not_to_say";

export const ratingChoiceSchema = z.object({ id: z.string().min(1), label: z.string().min(1) });
export const ratingItemSchema = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  prompt: z.string().min(1),
  choices: z.array(ratingChoiceSchema).min(2),
});
export const topicSchema = z.object({
  id: z.string().regex(/^[a-z_]+$/),
  label: z.string().min(1),
  /** What the Interviewer should find out. The model words the actual question. */
  goal: z.string().min(1),
  /** A plain way to open the topic. Used when code, not the model, has to ask first. */
  opener: z.string().min(1),
});
export const guidePartSchema = z.object({
  rating_items: z.array(ratingItemSchema).min(1),
  topics: z.array(topicSchema).min(1),
});

export type RatingItem = z.infer<typeof ratingItemSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type GuidePart = z.infer<typeof guidePartSchema>;

const recommendChoices = Array.from({ length: 11 }, (_, i) => ({ id: String(i), label: String(i) }));

export const DEFAULT_SESSION_GUIDE: GuidePart = {
  rating_items: [
    {
      id: "ability",
      prompt: "Could you now do what this session taught, on your own?",
      choices: [
        { id: "yes_without_help", label: "Yes, without help" },
        { id: "yes_with_guide", label: "Yes, with the guide beside me" },
        { id: "only_with_help", label: "Only with someone helping" },
        { id: "not_yet", label: "Not yet" },
      ],
    },
    {
      id: "pace",
      prompt: "How was the pace of the session?",
      choices: [
        { id: "too_slow", label: "Too slow" },
        { id: "about_right", label: "About right" },
        { id: "too_fast", label: "Too fast" },
      ],
    },
    {
      id: "relevance",
      prompt: "How much of this session will you use in your work?",
      choices: [
        { id: "most", label: "Most of it" },
        { id: "some", label: "Some of it" },
        { id: "a_little", label: "A little" },
        { id: "none_yet", label: "None yet" },
      ],
    },
    {
      id: "recommend",
      prompt: "How likely are you to recommend this session to a colleague, from 0 to 10?",
      choices: recommendChoices,
    },
  ],
  topics: [
    { id: "most_useful", label: "Most useful", goal: "What was most useful in this session, and why.", opener: "Thanks. Now a few questions about the session itself. What was the most useful part for you?" },
    { id: "unclear", label: "Unclear", goal: "What was unclear or confusing.", opener: "Was anything unclear or confusing?" },
    { id: "blockers", label: "Blockers", goal: "What blocked or slowed the learner down, during the session or since.", opener: "Did anything block or slow you down, during the session or since?" },
    { id: "change_next_time", label: "Change next time", goal: "What the instructor should change for the next session.", opener: "If you could change one thing for the next session, what would it be?" },
    { id: "brief_question", label: "From the session brief", goal: "One question drawn from the session brief's topics or known issues.", opener: "How did you get on with {topic}?" },
    { id: "last_changes", label: "Last session's changes", goal: "Whether the changes made after the last session helped.", opener: "After the last session we made some changes. Did they make a difference for you?" },
  ],
};

export const DEFAULT_FOLLOW_UP_GUIDE: GuidePart = {
  rating_items: [
    {
      id: "applied",
      prompt: "Since the course, have you used what you learned at work?",
      choices: [
        { id: "yes_regularly", label: "Yes, regularly" },
        { id: "yes_once_or_twice", label: "Yes, once or twice" },
        { id: "not_yet", label: "Not yet" },
        { id: "not_needed", label: "I haven't needed to" },
      ],
    },
  ],
  topics: [
    { id: "used_at_work", label: "Used at work", goal: "What the learner has used at work since the course, with a concrete example.", opener: "Since the course, what have you used at work? An example would help." },
    { id: "what_stopped", label: "What stopped them", goal: "What stopped or slowed them from using it.", opener: "What, if anything, stopped or slowed you from using it?" },
    { id: "support_needed", label: "Support needed", goal: "What support would help them use it more.", opener: "What support would help you use it more?" },
  ],
};

/** Every item offers "Prefer not to say", added in code so no guide can leave it out. */
export function choicesFor(item: RatingItem) {
  return [...item.choices, { id: PREFER_NOT_TO_SAY, label: "Prefer not to say" }];
}

export function isValidChoice(item: RatingItem, choice: string): boolean {
  return choicesFor(item).some((c) => c.id === choice);
}
