import { generateText, isStepCount, Output } from "ai";
import type { JobDeps } from "@/lib/server/jobs/queue";
import { languageModel } from "@/lib/server/ai/models";
import { modelIdFor } from "@/lib/server/ai/provider";
import { loadAgentFile } from "@/lib/server/ai/agent-file";
import { errorName, recordRun } from "@/lib/server/ai/runs";
import { emailInstructors } from "@/lib/server/notify";
import type { Json } from "@/lib/database.types";
import type { AdminClient } from "@/lib/server/supabase-admin";
import { answerSchema } from "./schema";
import { librarianTools, searchSources, type SourceHit } from "./tools";

export type Citation = {
  chunk_id: string;
  kind: SourceHit["kind"];
  title: string;
  /** Null when the source can't be opened by learners, such as an agents-only document. */
  url: string | null;
};

/**
 * Checks each cited chunk in code: it must have been returned by this run's searches, still
 * exist, and belong to the course (or, for documentation, to the course's organization).
 */
export async function checkCitations(db: AdminClient, courseId: string, cited: string[], seen: Map<string, SourceHit>): Promise<{ valid: SourceHit[]; rejected: string[] }> {
  const ids = [...new Set(cited)];
  if (!ids.length) return { valid: [], rejected: [] };
  const uuids = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const { data: course } = await db.from("courses").select("organization_id").eq("id", courseId).single();
  const { data: rows } = uuids.length
    ? await db.from("document_chunks").select("id, course_id, organization_id, source_kind").in("id", uuids)
    : { data: [] as Array<{ id: string; course_id: string | null; organization_id: string; source_kind: string }> };
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const valid: SourceHit[] = [];
  const rejected: string[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    const belongs = row && (row.course_id === courseId || (row.course_id === null && row.source_kind === "documentation_page" && row.organization_id === course?.organization_id));
    const hit = seen.get(id);
    if (row && belongs && hit) valid.push(hit);
    else rejected.push(id);
  }
  return { valid, rejected };
}

async function citationsFor(db: AdminClient, hits: SourceHit[], orgSlug: string, courseSlug: string): Promise<Citation[]> {
  const out: Citation[] = [];
  for (const h of hits) {
    let url: string | null = null;
    let title = h.title;
    if (h.kind === "session_document" && h.document_id) {
      const { data: doc } = await db.from("documents").select("title, audience").eq("id", h.document_id).maybeSingle();
      title = doc?.title ?? h.title;
      url = doc?.audience === "learners" ? `/api/documents/${h.document_id}/download` : null;
    } else if (h.kind === "documentation_page") {
      url = h.page_url;
    } else if (h.kind === "verified_answer" && h.answer_id) {
      const { data: ans } = await db.from("answers").select("question_id, sessions!inner(number)").eq("id", h.answer_id).maybeSingle();
      if (ans) url = `/${orgSlug}/${courseSlug}/sessions/${ans.sessions.number}#q-${ans.question_id}`;
    }
    if (!out.some((c) => c.chunk_id === h.id)) out.push({ chunk_id: h.id, kind: h.kind, title, url });
  }
  return out;
}

async function sendToInstructor(deps: JobDeps, q: { id: string; course_id: string; text: string; session_number: number }, reason: string) {
  await deps.admin.from("questions").update({ sent_to_instructor_at: deps.now().toISOString() }).eq("id", q.id);
  await emailInstructors(
    deps,
    q.course_id,
    `A question needs your answer (Session ${q.session_number})`,
    `${reason}\n\nThe question:\n${q.text}\n\nAnswer it on the session's Q&A board.`,
  );
}

/**
 * Job: the Librarian answers a question from the course's sources, or sends it to the
 * instructor. Nothing relevant enough found means no answer: the question moves to
 * needs_instructor without calling the model.
 */
export async function answerQuestion(payload: { question_id: string }, deps: JobDeps) {
  const db = deps.admin;
  const { data: q } = await db
    .from("questions")
    .select("id, organization_id, course_id, session_id, author_id, text, state, sessions!inner(number), courses!inner(slug, organizations!inner(slug))")
    .eq("id", payload.question_id)
    .maybeSingle();
  if (!q || q.state !== "open") return "skipped";
  const info = { id: q.id, course_id: q.course_id, text: q.text, session_number: q.sessions.number };

  const agent = loadAgentFile("librarian");
  const meta = {
    organizationId: q.organization_id,
    agent: "librarian" as const,
    agentVersion: agent.version,
    model: modelIdFor("librarian"),
    operation: "answer_question",
    sessionId: q.session_id,
    questionId: q.id,
    learnerId: q.author_id,
  };

  const searchMeta = { organizationId: q.organization_id, questionId: q.id, sessionId: q.session_id, learnerId: q.author_id };
  const first = await searchSources(db, q.course_id, q.text, searchMeta);
  if (!first.length) {
    await db.from("questions").update({ state: "needs_instructor" }).eq("id", q.id);
    await sendToInstructor(deps, info, "The course's sources don't cover this question.");
    return "needs_instructor";
  }

  const seen = new Map<string, SourceHit>();
  const started = performance.now();
  let output: ReturnType<typeof answerSchema.parse> | null = null;
  try {
    const result = await generateText({
      model: languageModel("librarian"),
      instructions: agent.instructions,
      prompt: `Task: answer_question\n\n<context>${JSON.stringify({ task: "answer_question", question: q.text })}</context>\n\nThe learner's question: ${q.text}`,
      tools: librarianTools(db, q.course_id, seen, searchMeta),
      output: Output.object({ schema: answerSchema }),
      stopWhen: isStepCount(5),
      maxOutputTokens: 1200,
    });
    output = answerSchema.parse(result.output);
    await recordRun(db, meta, { outcome: "ok", usage: result.totalUsage, providerMetadata: result.providerMetadata, latencyMs: performance.now() - started });
  } catch (err) {
    await recordRun(db, meta, { outcome: "validation_failed", latencyMs: performance.now() - started, error: errorName(err) });
  }

  const checked = output?.answerable ? await checkCitations(db, q.course_id, output.citations, seen) : { valid: [], rejected: [] };
  if (!output || !output.answerable || !output.answer.trim() || !checked.valid.length) {
    await db.from("questions").update({ state: "needs_instructor" }).eq("id", q.id);
    await sendToInstructor(deps, info, checked.rejected.length ? "The drafted answer cited sources that couldn't be checked." : "The course's sources don't cover this question.");
    return "needs_instructor";
  }

  const citations = await citationsFor(db, checked.valid, q.courses.organizations.slug, q.courses.slug);
  const now = deps.now().toISOString();
  await db.from("answers").insert({
    organization_id: q.organization_id,
    course_id: q.course_id,
    session_id: q.session_id,
    question_id: q.id,
    kind: "ai",
    text: output.answer.trim(),
    citations: citations as unknown as Json,
    sources_disagree: output.sources_disagree,
    agent_version: agent.version,
  });
  await db.from("questions").update({ state: "ai_answered", first_answered_at: now }).eq("id", q.id);
  if (output.sources_disagree) await sendToInstructor(deps, info, "The course's sources disagree on this question. The AI answer says so; please check it.");
  return "ai_answered";
}
