import type { StubCall, StubReply } from "@/lib/server/ai/stub-model";

// The Interviewer's stand-in. It follows AGENT.md in the simplest way, from the context the
// engine sends, so tests exercise the real engine around it.

type Choice = { id: string; label: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Matches a spoken or typed answer to a rating choice, or returns null when it's unclear. */
export function matchChoice(text: string, choices: Choice[]): string | null {
  const t = norm(text);
  if (/\b(rather not|prefer not|skip|pass)\b/.test(t)) return "prefer_not_to_say";
  const number = /\b(10|[0-9])\b/.exec(t);
  if (number && choices.some((c) => c.id === number[1])) return number[1];
  const words: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };
  for (const [w, n] of Object.entries(words)) if (new RegExp(`\\b${w}\\b`).test(t) && choices.some((c) => c.id === n)) return n;
  let best: { id: string; score: number } | null = null;
  for (const c of choices) {
    const label = norm(c.label);
    if (t === label || t.includes(label)) {
      const score = label.length + 100;
      if (!best || score > best.score) best = { id: c.id, score };
      continue;
    }
    const labelWords = label.split(" ").filter((w) => w.length > 2);
    const hits = labelWords.filter((w) => t.split(" ").includes(w)).length;
    if (labelWords.length && hits / labelWords.length >= 0.75) {
      const score = hits;
      if (!best || score > best.score) best = { id: c.id, score };
    }
  }
  return best?.id ?? null;
}

const QUESTIONS: Record<string, string> = {
  most_useful: "What was the most useful part of the session for you?",
  unclear: "Was anything unclear or confusing?",
  blockers: "Did anything block or slow you down, during the session or since?",
  change_next_time: "What would you change about the next session?",
  brief_question: "How did you get on with that part of the session?",
  last_changes: "How did the balance of this session work for you?",
  used_at_work: "What have you used at work since the course?",
  what_stopped: "What, if anything, stopped you using it?",
  support_needed: "What support would help you use it more?",
};

function out(reply: string, topic_action: "follow_up" | "next_topic" | "stay", extra: Partial<{ learner_declined: boolean; offered_to_post_question: boolean; learner_asked_to_stop: boolean; learner_is_blocked: boolean }> = {}): StubReply {
  return { text: JSON.stringify({ reply, topic_action, learner_declined: false, offered_to_post_question: false, learner_asked_to_stop: false, learner_is_blocked: blockedTurn, ...extra }) };
}

function lastLearnerQuestion(call: StubCall): string | null {
  const users = call.prompt.filter((m) => m.role === "user");
  for (let i = users.length - 2; i >= 0; i--) {
    const content = users[i].content;
    const text = typeof content === "string" ? content : content.map((p) => ("text" in p ? p.text : "")).join("");
    if (text.includes("?")) return text.trim();
  }
  return null;
}

/** Set per call: the stub confirms a blocker in its reply when it flagged one. */
let blockedTurn = false;

export function interviewerStub(call: StubCall): StubReply {
  const ctx = call.context;
  const text = call.lastUser;
  const t = norm(text);
  const already = new Set(call.toolResults.map((r) => r.name));
  blockedTurn = already.has("flag_blocker");

  if (ctx.stage === "read_back") {
    const learnerTurns = call.prompt
      .filter((m) => m.role === "user")
      .map((m) => (typeof m.content === "string" ? m.content : m.content.map((p) => ("text" in p ? p.text : "")).join("")))
      .filter((s) => s.length > 12 && !/summari[sz]e|^My reply to the summary/i.test(s));
    const points = learnerTurns.slice(-5).map((s) => `You said ${s.replace(/\s+/g, " ").replace(/[.!?]*$/, "").slice(0, 160).replace(/^I /, "you ")}.`);
    while (points.length < 3) points.push(points.length === 0 ? "You shared your views on the session." : "You had nothing more to add.");
    const reply = typeof ctx.learner_reply === "string" ? ctx.learner_reply : null;
    const previous = Array.isArray(ctx.previous_summary) ? (ctx.previous_summary as string[]) : null;
    if (reply && previous && /\b(start|begin)\b.*\bagain\b|\brestart\b|\bstart over\b/i.test(reply)) {
      return { text: JSON.stringify({ points: previous, request: "other", reply: "I can't start the interview again, but you can change any point on the summary screen before you submit." }) };
    }
    if (reply && points.length) points[points.length - 1] = `Correction: ${reply.slice(0, 200)}`;
    return { text: JSON.stringify({ points: points.slice(0, 5), request: "correction", reply: null }) };
  }

  if (ctx.stage === "ratings") {
    const item = ctx.item as { id: string; choices: Choice[] };
    if (!already.has("save_rating")) {
      const choice = matchChoice(text, item.choices);
      if (choice) return { toolCalls: [{ name: "save_rating", input: { item_id: item.id, choice } }] };
      const labels = item.choices.map((c) => c.label).join(", ");
      return out(`Sorry, I didn't quite catch that. Which is closest: ${labels}?`, "stay");
    }
    return out("Thanks.", "stay");
  }

  // Conversation.
  const current = ctx.current_topic as { id: string; follow_up_available: boolean } | null;
  const next = ctx.next_topic as { id: string; suggested_opener: string } | null;
  const offered = ctx.you_offered_to_post_a_question_last_turn === true;

  if (!call.toolResults.length) {
    const calls: StubReply["toolCalls"] = [];
    if (/\b(stop|end the interview|that s all|im done|i m done|finish now)\b/.test(t)) calls.push({ name: "end_interview", input: {} });
    if (/\b(can t|cannot|couldn t|still can t|unable to) (log ?in|sign ?in|access|get in)\b|\blocked out\b|\bno access\b/.test(t)) {
      calls.push({ name: "flag_blocker", input: { summary: `Learner reports: ${text.slice(0, 200)}` } });
    }
    if (offered && /\b(yes|yeah|sure|ok|okay|please)\b/.test(t)) {
      const q = lastLearnerQuestion(call);
      if (q) calls.push({ name: "raise_question", input: { text: q } });
    }
    if (calls.length) return { toolCalls: calls };
  }
  if (already.has("end_interview")) return out("Okay, let's stop there.", "stay", { learner_asked_to_stop: true });

  const nextQuestion = next ? next.suggested_opener || QUESTIONS[next.id] || "What else would you like to tell the instructor?" : "Thank you, that's everything I wanted to ask.";

  if (/\b(rather not|prefer not|skip|no comment|don t want to say)\b/.test(t)) {
    return out(`That's fine. ${nextQuestion}`, "next_topic", { learner_declined: true });
  }
  if (/^(how|what|where|why|can|could|is|does|do)\b/.test(t) && text.trim().endsWith("?") && !offered) {
    return out("That's a good question for the session's Q&A board. Would you like me to post it there?", "stay", { offered_to_post_question: true });
  }
  if (offered && call.toolResults.some((r) => r.name === "raise_question")) {
    return out(`Done, I've posted it. ${nextQuestion}`, "next_topic");
  }
  if (offered) return out(`No problem. ${nextQuestion}`, "next_topic");

  const words = t.split(" ").filter(Boolean).length;
  if (current?.follow_up_available && words > 0 && words < 6) {
    return out("Could you tell me a bit more about that, maybe with an example?", "follow_up");
  }
  return out(`Thanks. ${nextQuestion}`, "next_topic");
}
