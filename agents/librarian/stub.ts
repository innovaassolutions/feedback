import type { StubCall, StubReply } from "@/lib/server/ai/stub-model";

// The Librarian's stand-in for tests and keyless development. It does what the instructions
// ask in the plainest possible way, from the context the agent sends.

type Excerpt = { title: string; heading: string | null; text: string };

const GENERIC = new Set(["introduction", "overview", "summary", "agenda", "contents", "notes", "transcript", "welcome", "next steps", "questions"]);

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function draftBriefStub(context: Record<string, unknown>): StubReply {
  const excerpts = (context.excerpts as Excerpt[]) ?? [];
  const objectivesText = String(context.session_objectives ?? "");
  const headings = unique(
    excerpts
      .flatMap((e) => [e.heading, ...[...e.text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1])])
      .filter((h): h is string => Boolean(h))
      .map((h) => h.replace(/^(step|part)\s+\d+[:.)]?\s*/i, "").trim())
      .filter((h) => h.length > 2 && !GENERIC.has(h.toLowerCase())),
  );
  const phrases = unique(
    excerpts.flatMap((e) => [...e.text.matchAll(/\b([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})\b/g)].map((m) => m[1])),
  );
  const topics = (headings.length >= 3 ? headings : unique([...headings, ...phrases])).slice(0, 10);
  const issues = unique(
    excerpts
      .flatMap((e) => e.text.split(/(?<=[.!?])\s+|\n/))
      .map((s) => s.trim())
      .filter((s) => /\b(can't|cannot|couldn't|error|issue|problem|fail(ed|s)?|stuck)\b/i.test(s) && s.length < 240),
  ).slice(0, 4);
  const objectives = objectivesText
    ? objectivesText.split(/(?<=[.;])\s+/).map((s) => s.replace(/[.;]$/, "").trim()).filter(Boolean).slice(0, 5)
    : topics.slice(0, 3).map((t) => `Use ${t}`);
  return {
    text: JSON.stringify({
      objectives: objectives.length ? objectives : ["Apply what the session covered"],
      topics: topics.length ? topics : ["Session content"],
      known_issues: issues,
    }),
  };
}

type Hit = { id: string; kind: string; title: string; text: string };

/** Searches once with the question, then answers from the best passage and cites it. */
export function answerStub(call: StubCall): StubReply {
  if (!call.toolResults.length) return { toolCalls: [{ name: "search_sources", input: { query: String(call.context.question ?? call.lastUser) } }] };
  const hits = call.toolResults.flatMap((r) => (Array.isArray(r.output) ? (r.output as Hit[]) : []));
  if (!hits.length) return { text: JSON.stringify({ answerable: false, answer: "", citations: [], sources_disagree: false }) };
  const top = hits[0];
  const sentences = top.text.replace(/^#+\s.*$/gm, "").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 10).slice(0, 3);
  return { text: JSON.stringify({ answerable: true, answer: sentences.join(" ") || top.text.slice(0, 300), citations: [top.id], sources_disagree: false }) };
}

export function librarianStub(call: StubCall): StubReply {
  if (call.context.task === "draft_brief") return draftBriefStub(call.context);
  if (call.context.task === "answer_question") return answerStub(call);
  return { text: JSON.stringify({ answerable: false, answer: "", citations: [], sources_disagree: false }) };
}
