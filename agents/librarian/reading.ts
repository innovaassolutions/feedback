import { embedMany, generateText, Output } from "ai";
import type { JobDeps } from "@/lib/server/jobs/queue";
import { enqueue } from "@/lib/server/jobs/queue";
import { embeddingModel, languageModel } from "@/lib/server/ai/models";
import { embeddingModelId, modelIdFor } from "@/lib/server/ai/provider";
import { loadAgentFile } from "@/lib/server/ai/agent-file";
import { errorName, recordRun, trackRun } from "@/lib/server/ai/runs";
import { detectDocumentKind } from "@/lib/files";
import { chunkText } from "@/lib/server/librarian/chunk";
import { extractText, UnreadableDocument } from "@/lib/server/librarian/extract";
import type { AdminClient } from "@/lib/server/supabase-admin";
import { briefDraftSchema, tidyBrief, type Brief } from "./schema";

/** Embeds texts with the configured model and records the call. */
export async function embedTexts(
  db: AdminClient,
  texts: string[],
  meta: { organizationId: string; operation: string; sessionId?: string | null; questionId?: string | null },
): Promise<number[][]> {
  if (!texts.length) return [];
  const agent = loadAgentFile("librarian");
  return trackRun(
    db,
    { ...meta, agent: "librarian", agentVersion: agent.version, model: embeddingModelId() },
    async () => {
      const result = await embedMany({ model: embeddingModel(), values: texts, maxParallelCalls: 2 });
      return { value: result.embeddings, usage: { inputTokens: result.usage?.tokens ?? 0, outputTokens: 0 } };
    },
  );
}

export const toVector = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}]`;

/** Job: extract a document's text, split it into chunks, embed them and store them. */
export async function readDocument(payload: { document_id: string }, deps: JobDeps) {
  const db = deps.admin;
  const { data: doc } = await db.from("documents").select("*").eq("id", payload.document_id).maybeSingle();
  if (!doc) return; // removed before it was read
  try {
    const download = await db.storage.from("documents").download(doc.storage_path);
    if (download.error || !download.data) throw new UnreadableDocument("The uploaded file couldn't be found. Upload it again.");
    const bytes = new Uint8Array(await download.data.arrayBuffer());
    const kind = detectDocumentKind(doc.file_name, bytes);
    if (!kind) throw new UnreadableDocument("This file type can't be read.");
    const text = await extractText(kind, bytes);
    const chunks = chunkText(text);
    const embeddings = await embedTexts(
      db,
      chunks.map((c) => `${doc.title}${c.heading ? ` — ${c.heading}` : ""}\n${c.content}`),
      { organizationId: doc.organization_id, operation: "embed_document", sessionId: doc.session_id },
    );
    await db.from("document_chunks").delete().eq("document_id", doc.id);
    const rows = chunks.map((c, i) => ({
      organization_id: doc.organization_id,
      course_id: doc.course_id,
      session_id: doc.session_id,
      source_kind: "session_document" as const,
      document_id: doc.id,
      title: c.heading ? `${doc.title} — ${c.heading}` : doc.title,
      content: c.content,
      chunk_index: c.index,
      embedding: toVector(embeddings[i]),
    }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await db.from("document_chunks").insert(rows.slice(i, i + 100));
      if (error) throw new Error(`store chunks: ${error.message}`);
    }
    await db
      .from("documents")
      .update({ status: "ready", error: null, chunk_count: rows.length, updated_at: deps.now().toISOString() })
      .eq("id", doc.id);
    await enqueue(db, {
      kind: "draft_brief",
      payload: { session_id: doc.session_id },
      organizationId: doc.organization_id,
      dedupeKey: `draft_brief:${doc.session_id}:${doc.id}`,
    });
  } catch (err) {
    const message =
      err instanceof UnreadableDocument ? err.message : "Something went wrong while reading this file. Try uploading it again.";
    await db.from("documents").update({ status: "failed", error: message, updated_at: deps.now().toISOString() }).eq("id", doc.id);
    if (!(err instanceof UnreadableDocument)) console.error(`[read_document] ${errorName(err)}`);
  }
}

const MAX_EXCERPT_CHARS = 40_000;

/** Job: the Librarian drafts the session brief from the session's documents. */
export async function draftBrief(payload: { session_id: string }, deps: JobDeps): Promise<Brief | null> {
  const db = deps.admin;
  const { data: session } = await db.from("sessions").select("id, organization_id, title, objectives").eq("id", payload.session_id).maybeSingle();
  if (!session) return null;
  const { data: chunks } = await db
    .from("document_chunks")
    .select("title, content, chunk_index, documents!inner(title, created_at, status)")
    .eq("session_id", session.id)
    .eq("source_kind", "session_document")
    .eq("documents.status", "ready")
    .order("chunk_index");
  if (!chunks?.length) return null;

  const excerpts: Array<{ title: string; heading: string | null; text: string }> = [];
  let total = 0;
  for (const c of chunks) {
    if (total + c.content.length > MAX_EXCERPT_CHARS) break;
    const heading = c.title.includes(" — ") ? c.title.split(" — ").slice(1).join(" — ") : null;
    excerpts.push({ title: c.documents.title, heading, text: c.content });
    total += c.content.length;
  }

  const agent = loadAgentFile("librarian");
  const model = modelIdFor("librarian");
  const context = { task: "draft_brief", session_title: session.title, session_objectives: session.objectives, excerpts };
  const started = performance.now();
  try {
    const result = await generateText({
      model: languageModel("librarian"),
      instructions: agent.instructions,
      prompt: `Task: draft_brief\n\n<context>${JSON.stringify(context)}</context>`,
      output: Output.object({ schema: briefDraftSchema }),
      maxOutputTokens: 1500,
    });
    const brief = tidyBrief(briefDraftSchema.parse(result.output));
    if (!brief) throw Object.assign(new Error("The draft had no objective or no topic"), { name: "EmptyBrief" });
    await recordRun(
      db,
      { organizationId: session.organization_id, agent: "librarian", agentVersion: agent.version, model, operation: "draft_brief", sessionId: session.id },
      { outcome: "ok", usage: result.usage, providerMetadata: result.providerMetadata, latencyMs: performance.now() - started },
    );
    await db.from("sessions").update({ brief_draft: brief, brief_draft_at: deps.now().toISOString() }).eq("id", session.id);
    return brief;
  } catch (err) {
    await recordRun(
      db,
      { organizationId: session.organization_id, agent: "librarian", agentVersion: agent.version, model, operation: "draft_brief", sessionId: session.id },
      { outcome: "validation_failed", latencyMs: performance.now() - started, error: errorName(err) },
    );
    throw err;
  }
}
