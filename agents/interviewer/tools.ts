import { tool } from "ai";
import { z } from "zod";

// The Interviewer's tools. Each is named after the operation or effect it triggers. They only
// record what the model asked for; code checks each effect before anything is written. There is
// deliberately no tool to read other learners' feedback, the roster or the dashboard.

export type ToolEffect =
  | { type: "save_rating"; item_id: string; choice: string }
  | { type: "raise_question"; text: string }
  | { type: "flag_blocker"; summary: string }
  | { type: "end_interview" };

export function interviewerTools(effects: ToolEffect[]) {
  return {
    save_rating: tool({
      description: "Save the learner's answer to the rating item being asked. Use the choice id from the context.",
      inputSchema: z.object({ item_id: z.string(), choice: z.string() }),
      execute: async ({ item_id, choice }) => {
        effects.push({ type: "save_rating", item_id, choice });
        return { saved: true };
      },
    }),
    raise_question: tool({
      description: "Post the learner's content question to the session's Q&A board. Only after they agreed to it.",
      inputSchema: z.object({ text: z.string().min(3).max(2000) }),
      execute: async ({ text }) => {
        effects.push({ type: "raise_question", text });
        return { posted: true, note: "Posted. Don't post it again." };
      },
    }),
    flag_blocker: tool({
      description: "Tell the instructor at once about something that stops the learner from using what was taught now and that they can't get past alone. Not for things that were hard but got solved.",
      inputSchema: z.object({ summary: z.string().min(3).max(300) }),
      execute: async ({ summary }) => {
        effects.push({ type: "flag_blocker", summary });
        return { flagged: true };
      },
    }),
    end_interview: tool({
      description: "Only when the learner has said they want to stop or finish now. Moves to the read-back.",
      inputSchema: z.object({}),
      execute: async () => {
        effects.push({ type: "end_interview" });
        return { ending: true };
      },
    }),
  };
}

export const INTERVIEWER_TOOL_NAMES = Object.keys(interviewerTools([])).sort();
