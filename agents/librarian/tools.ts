import { embed, tool } from "ai";
import { z } from "zod";
import type { AdminClient } from "@/lib/server/supabase-admin";
import { embeddingModel, relevanceThreshold } from "@/lib/server/ai/models";
import { embeddingModelId } from "@/lib/server/ai/provider";
import { loadAgentFile } from "@/lib/server/ai/agent-file";
import { trackRun } from "@/lib/server/ai/runs";

/** Who a search is for, so the embedding call is recorded in agent_runs like every other agent call. */
export type SearchMeta = { organizationId: string; questionId: string | null; sessionId: string | null; learnerId: string | null };

export type SourceHit = {
  id: string;
  kind: "session_document" | "documentation_page" | "verified_answer";
  title: string;
  content: string;
  document_id: string | null;
  page_url: string | null;
  answer_id: string | null;
  session_id: string | null;
  similarity: number;
};

export const toVector = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}]`;

/** Searches one course's three kinds of source. Only chunks above the relevance threshold count. */
export async function searchSources(db: AdminClient, courseId: string, query: string, meta: SearchMeta, count = 6): Promise<SourceHit[]> {
  const embedding = await trackRun(
    db,
    { ...meta, agent: "librarian", agentVersion: loadAgentFile("librarian").version, model: embeddingModelId(), operation: "search_sources" },
    async () => {
      const r = await embed({ model: embeddingModel(), value: query });
      return { value: r.embedding, usage: { inputTokens: r.usage?.tokens ?? 0, outputTokens: 0 } };
    },
  );
  const { data, error } = await db.rpc("match_chunks", { p_course_id: courseId, p_embedding: toVector(embedding), p_count: count });
  if (error) throw new Error(`match_chunks: ${error.message}`);
  const threshold = relevanceThreshold();
  return ((data ?? []) as Array<Omit<SourceHit, "kind"> & { source_kind: SourceHit["kind"] }>)
    .filter((r) => r.similarity >= threshold)
    .map((r) => ({ ...r, kind: r.source_kind }));
}

/**
 * The Librarian's one tool. It searches only the course it is answering for, and remembers every
 * chunk it returned, so code can check that each citation came from this search.
 */
export function librarianTools(db: AdminClient, courseId: string, seen: Map<string, SourceHit>, meta: SearchMeta) {
  return {
    search_sources: tool({
      description: "Search this course's session documents, documentation pages and verified answers. Returns the most relevant passages with their ids.",
      inputSchema: z.object({ query: z.string().min(2).max(300) }),
      execute: async ({ query }) => {
        const hits = await searchSources(db, courseId, query, meta);
        for (const h of hits) seen.set(h.id, h);
        return hits.map((h) => ({ id: h.id, kind: h.kind, title: h.title, text: h.content.slice(0, 1500) }));
      },
    }),
  };
}
