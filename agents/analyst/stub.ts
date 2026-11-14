import type { StubCall, StubReply } from "@/lib/server/ai/stub-model";
import type { Theme } from "./schema";

// The Analyst's stand-in: keyword themes and real sentences from the learner's turns.

const THEME_WORDS: Array<[Theme, RegExp]> = [
  ["Pace and timing", /\b(pace|fast|slow|rushed|time|timing|quick|long)\b/i],
  ["Platform and access", /\b(log ?in|sign ?in|access|password|platform|workspace|account|locked)\b/i],
  ["Materials and documentation", /\b(guide|slides?|docs?|documentation|materials?|handout|notes)\b/i],
  ["Hands-on practice", /\b(hands-on|practi[cs]e|exercise|try|tried|lab|build|rebuild|example)\b/i],
  ["Instructor delivery", /\b(instructor|explain|explained|explanation|presenter|demo|showed)\b/i],
  ["Content and relevance", /\b(useful|relevant|content|topic|learned|applicable|work)\b/i],
  ["Logistics", /\b(room|wifi|wi-fi|schedule|venue|lunch|zoom|break)\b/i],
  ["Support and follow-up", /\b(help|support|follow-up|follow up|questions?|after the session)\b/i],
];
const NEGATIVE = /\b(couldn't|could not|can't|cannot|confus\w*|hard|difficult|too fast|too slow|rushed|error|blocked|stuck|didn't|lost|unclear|problem)\b/i;
const POSITIVE = /\b(great|useful|helpful|clear|liked|loved|good|easy|enjoyed|excellent)\b/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 8);
}

export function analystStub(call: StubCall): StubReply {
  if (call.context.task === "session_summary") {
    const n = call.context.numbers as Record<string, number | string | null>;
    const top = (call.context.top_themes as string[] | undefined)?.slice(0, 2).join(" and ") || "the session";
    return { text: JSON.stringify({ summary: `${n.responses} of ${n.enrolled} learners responded. ${n.able_to_apply} said they could apply what was taught. Learners talked most about ${top}.` }) };
  }
  const turns = (call.context.learner_turns as string[]) ?? [];
  const themes = new Map<Theme, { pos: number; neg: number; line: string }>();
  const quotes: Array<{ text: string; theme: Theme }> = [];
  const blockers: string[] = [];
  const suggestions: string[] = [];
  for (const turn of turns) {
    for (const s of sentences(turn)) {
      for (const [theme, re] of THEME_WORDS) {
        if (!re.test(s)) continue;
        const entry = themes.get(theme) ?? { pos: 0, neg: 0, line: s };
        if (NEGATIVE.test(s)) entry.neg++;
        else if (POSITIVE.test(s)) entry.pos++;
        themes.set(theme, entry);
        if (quotes.length < 3 && s.length < 200 && !quotes.some((q) => q.text === s)) quotes.push({ text: s, theme });
        break;
      }
      if (/\b(can't|cannot|couldn't|stuck|blocked|no access)\b/i.test(s) && blockers.length < 3) blockers.push(s.replace(/^I /, "Learner "));
      if (/\b(should|would like|wish|could you|next time|more)\b/i.test(s) && suggestions.length < 3) suggestions.push(s);
    }
  }
  const out = {
    themes: [...themes.entries()].map(([theme, e]) => ({
      theme,
      sentiment: e.neg && e.pos ? "mixed" : e.neg ? "negative" : "positive",
      paraphrase: `The learner talked about ${theme.toLowerCase()}.`,
    })),
    blockers,
    suggestions,
    quotes,
    paraphrases: [...themes.keys()].map((theme) => ({ text: `Comments on ${theme.toLowerCase()}.`, theme })),
  };
  return { text: JSON.stringify(out) };
}
