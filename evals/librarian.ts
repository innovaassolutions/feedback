// Set 3: the Librarian answers eight questions about one session from fixture sources: the
// session's transcript and slides, another session's transcript, product documentation pages and a
// verified answer. Retrieval runs in memory with the real embedding model and the same group shares
// as production; the answer is drafted by the same code as the answer job. Scored in code.

import { embedMany } from "ai";
import { embeddingModel, relevanceThreshold } from "@/lib/server/ai/models";
import { loadAgentFile } from "@/lib/server/ai/agent-file";
import { draftAnswer } from "@/agents/librarian/answer";
import { pickShares, type Search, type SourceHit } from "@/agents/librarian/tools";
import { CASES, EVAL_SESSION, SOURCES, scoreCase, type CaseResult } from "@/agents/librarian/evals/cases";

export const PASS_LIBRARIAN = 0.85;

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export async function runLibrarianSet(log: (line: string) => void) {
  const agent = loadAgentFile("librarian");
  const { embeddings } = await embedMany({ model: embeddingModel(), values: SOURCES.map((s) => `${s.title}\n${s.content}`) });
  const threshold = relevanceThreshold();

  const search: Search = async (query, scope) => {
    const { embeddings: [q] } = await embedMany({ model: embeddingModel(), values: [query] });
    const hits: SourceHit[] = SOURCES.map((s, i) => ({
      id: s.id,
      kind: s.kind,
      group: s.group,
      title: s.title,
      content: s.content,
      document_id: null,
      page_url: s.page_url ?? null,
      answer_id: null,
      session_id: null,
      session_number: s.session_number ?? null,
      session_title: s.session_number === EVAL_SESSION.number ? EVAL_SESSION.title : s.session_number ? "Workspace set-up" : null,
      transcript: s.transcript === true,
      similarity: cosine(q, embeddings[i]),
    })).filter((h) => h.similarity >= threshold);
    return pickShares(hits, scope);
  };

  const results: Array<CaseResult & { answer: string; citations: string[]; sources_disagree: boolean; latency_ms: number }> = [];
  for (const c of CASES) {
    const started = performance.now();
    let row: (typeof results)[number];
    try {
      const { output, seen } = await draftAnswer({ question: c.question, session: EVAL_SESSION, search }, agent.instructions);
      row = { ...scoreCase(c, output, new Set(seen.keys())), answer: output.answer, citations: output.citations, sources_disagree: output.sources_disagree, latency_ms: Math.round(performance.now() - started) };
    } catch (err) {
      row = { id: c.id, passed: false, problems: [`failed: ${err instanceof Error ? err.message : String(err)}`], answer: "", citations: [], sources_disagree: false, latency_ms: Math.round(performance.now() - started) };
    }
    log(`  librarian ${c.id}: ${row.passed ? "pass" : `FAIL (${row.problems.join("; ")})`}`);
    results.push(row);
  }
  const rate = results.filter((r) => r.passed).length / results.length;
  return { cases: results, pass_rate: rate, pass_mark: PASS_LIBRARIAN, passed: rate >= PASS_LIBRARIAN };
}
