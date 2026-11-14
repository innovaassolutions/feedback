import { createSession, setSessionState } from "@/lib/server/ops/sessions";
import { saveRating, sendTurn, startInterview, submitInterview, type PublicInterview } from "@/lib/server/ops/interviews";
import type { SeedUserKey } from "@/lib/server/seed";
import { ctxAs, type TestCtx } from "./ctx";
import { seeded } from "./db";

/** Creates a session of its own and opens it, so a test's interviews don't affect anyone else's. */
export async function openSession(title: string): Promise<{ id: string; number: number }> {
  const ids = await seeded();
  const marcus = await ctxAs("marcus");
  const { session } = await createSession(marcus, { course_id: ids.ime, title, date: "2026-12-04", objectives: "Practise the steps." });
  await setSessionState(marcus, { session_id: session.id, state: "scheduled" });
  await setSessionState(marcus, { session_id: session.id, state: "open" });
  return { id: session.id, number: session.number };
}

export const LONG_ANSWERS = [
  "The hands-on part where we rebuilt the workflow ourselves was the most useful, because I could try every step.",
  "The part about the Core Agent settings was unclear and I got lost when the instructor moved on quickly.",
  "I couldn't sign in to the training workspace for the first ten minutes, which slowed me down a lot.",
  "Next time I would like more time for the exercises and a printed copy of the rebuild guide.",
  "The changes from last time helped because the guide was easier to follow this time around.",
];

export type InterviewRun = { ctx: TestCtx; interview: PublicInterview; turns: string[] };

/** Runs an interview from consent to the read-back, answering every rating with a chip. */
export async function interviewToReadBack(
  who: SeedUserKey,
  sessionId: string,
  anonymity: "named" | "anonymous" | "private",
  opts: { choices?: Record<string, string>; answers?: string[]; skipRating?: string } = {},
): Promise<InterviewRun> {
  const ctx = await ctxAs(who);
  const started = await startInterview(ctx, { session_id: sessionId, anonymity, kind: "session" });
  let interview = started.interview;
  const turns: string[] = [];
  interview = (await sendTurn(ctx, { interview_id: interview.id, text: "Ready", mode: "text" })).interview;
  turns.push("Ready");
  const choices = opts.choices ?? { ability: "yes_with_guide", pace: "about_right", relevance: "most", recommend: "8" };
  while (interview.stage === "ratings" && interview.pending_rating) {
    const item = interview.pending_rating.id;
    if (item === opts.skipRating) break;
    interview = (await saveRating(ctx, { interview_id: interview.id, item_id: item, choice: choices[item] ?? "prefer_not_to_say" })).interview;
  }
  const answers = opts.answers ?? LONG_ANSWERS;
  let i = 0;
  while (interview.stage === "conversation" && i < 20) {
    const text = answers[i % answers.length];
    interview = (await sendTurn(ctx, { interview_id: interview.id, text, mode: "text" })).interview;
    turns.push(text);
    i++;
  }
  return { ctx, interview, turns };
}

export async function submit(run: InterviewRun, anonymity?: "named" | "anonymous" | "private") {
  return submitInterview(run.ctx, {
    interview_id: run.interview.id,
    anonymity: anonymity ?? run.interview.anonymity,
    summary: run.interview.summary ?? ["You gave feedback."],
  });
}
