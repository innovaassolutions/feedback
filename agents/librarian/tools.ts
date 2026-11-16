import { embed, tool } from "ai";
import { z } from "zod";
import type { AdminClient } from "@/lib/server/supabase-admin";
import { embeddingModel, relevanceThreshold } from "@/lib/server/ai/models";
import { embeddingModelId } from "@/lib/server/ai/provider";
import { loadAgentFile } from "@/lib/server/ai/agent-file";
import { trackRun } from "@/lib/server/ai/runs";

/** Who a search is for, so the embedding call is recorded in agent_runs like every other agent call. */
export type SearchMeta = { organizationId: string; questionId: string | null; sessionId: string | null; learnerId: string | null };

/** Where a passage comes from, relative to the session the question was asked on. */
export type SourceGroup = "this_session" | "other_session" | "documentation" | "verified_answer";

export type SourceHit = {
  id: string;
  kind: "session_document" | "documentation_page" | "verified_answer";
  group: SourceGroup;
  title: string;
  content: string;
  document_id: string | null;
  page_url: string | null;
  answer_id: string | null;
  session_id: string | null;
  session_number: number | null;
  session_title: string | null;
  /** A recording's transcript rather than slides or a guide. */
  transcript: boolean;
  similarity: number;
};

/** "everything", or one group the model wants more of. */
export const SEARCH_SCOPES = ["everything", "this_session", "documentation"] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

/** How many passages each group may contribute to one search, so every kind of source is weighed. */
const SHARE: Record<SourceGroup, number> = { this_session: 4, documentation: 4, verified_answer: 2, other_session: 2 };
const NARROW = 6;

/** Picks each group's share from passages that are already over the relevance threshold, best first. */
export function pickShares(hits: SourceHit[], scope: SearchScope): SourceHit[] {
  const sorted = [...hits].sort((a, b) => b.similarity - a.similarity);
  if (scope !== "everything") return sorted.filter((h) => h.group === scope).slice(0, NARROW);
  const taken: Record<SourceGroup, number> = { this_session: 0, documentation: 0, verified_answer: 0, other_session: 0 };
  return sorted.filter((h) => (taken[h.group] += 1) <= SHARE[h.group]);
}

const TRANSCRIPT_MIME = new Set(["text/vtt", "application/x-subrip"]);

export function isTranscript(fileName: string | null, mimeType: string | null, title: string): boolean {
  return (mimeType !== null && TRANSCRIPT_MIME.has(mimeType)) || /transcript/i.test(`${fileName ?? ""} ${title}`);
}

/** How the model sees where a passage comes from. */
export function sourceLabel(h: SourceHit): string {
  const material = h.transcript ? "transcript" : "document";
  if (h.group === "this_session") return `This session's ${material}${h.session_number !== null ? ` (Session ${h.session_number}: ${h.session_title})` : ""}: ${h.title}`;
  if (h.group === "other_session") return `${h.session_number !== null ? `Session ${h.session_number}` : "Another session"}'s ${material}: ${h.title}`;
  if (h.group === "documentation") return `Product documentation: ${h.title}${h.page_url ? ` (${h.page_url})` : ""}`;
  return `Verified answer to an earlier question${h.session_number !== null ? ` (Session ${h.session_number})` : ""}`;
}

export const toVector = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}]`;

/** A search over one course's sources, as the Librarian's tool calls it. */
export type Search = (query: string, scope: SearchScope) => Promise<SourceHit[]>;

/**
 * Searches one course's sources for a question asked on one session: that session's documents,
 * other sessions' documents, the organization's product documentation and verified answers. Only
 * passages above the relevance threshold count.
 */
export async function searchSources(
  db: AdminClient,
  courseId: string,
  sessionId: string | null,
  query: string,
  meta: SearchMeta,
  scope: SearchScope = "everything",
): Promise<SourceHit[]> {
  const embedding = await trackRun(
    db,
    { ...meta, agent: "librarian", agentVersion: loadAgentFile("librarian").version, model: embeddingModelId(), operation: "search_sources" },
    async () => {
      const r = await embed({ model: embeddingModel(), value: query });
      return { value: r.embedding, usage: { inputTokens: r.usage?.tokens ?? 0, outputTokens: 0 } };
    },
  );
  const { data, error } = await db.rpc("match_chunks_grouped", {
    p_course_id: courseId,
    // A session no chunk belongs to puts every session document in "other sessions".
    p_session_id: sessionId ?? "00000000-0000-0000-0000-000000000000",
    p_embedding: toVector(embedding),
    p_per_group: NARROW,
  });
  if (error) throw new Error(`match_chunks_grouped: ${error.message}`);
  const threshold = relevanceThreshold();
  const hits: SourceHit[] = (data ?? [])
    .filter((r) => r.similarity >= threshold)
    .map((r) => ({
      id: r.id,
      kind: r.source_kind,
      group: r.source_group as SourceGroup,
      title: r.title,
      content: r.content,
      document_id: r.document_id,
      page_url: r.page_url,
      answer_id: r.answer_id,
      session_id: r.session_id,
      session_number: r.session_number,
      session_title: r.session_title,
      transcript: r.source_kind === "session_document" && isTranscript(r.file_name, r.mime_type, r.title),
      similarity: r.similarity,
    }));
  return pickShares(hits, scope);
}

/**
 * The Librarian's one tool. It searches only the course it is answering for, and remembers every
 * passage it returned, so code can check that each citation came from this search.
 */
export function librarianTools(search: Search, seen: Map<string, SourceHit>) {
  return {
    search_sources: tool({
      description:
        "Search this course's sources: this session's documents and transcript, other sessions' documents, the product documentation and verified answers. " +
        "Each passage says where it comes from. Use scope \"this_session\" or \"documentation\" to look further in one of them.",
      inputSchema: z.object({
        query: z.string().min(2).max(300),
        scope: z.enum(SEARCH_SCOPES).default("everything"),
      }),
      execute: async ({ query, scope }) => {
        const hits = await search(query, scope);
        for (const h of hits) seen.set(h.id, h);
        return hits.map((h) => ({ id: h.id, kind: h.kind, source: sourceLabel(h), title: h.title, text: h.content.slice(0, 1500) }));
      },
    }),
  };
}
