import { generateText, Output } from "ai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { JobDeps } from "@/lib/server/jobs/queue";
import { enqueue } from "@/lib/server/jobs/queue";
import { languageModel } from "@/lib/server/ai/models";
import { modelIdFor } from "@/lib/server/ai/provider";
import { loadAgentFile } from "@/lib/server/ai/agent-file";
import { errorName, recordRun } from "@/lib/server/ai/runs";
import type { Json } from "@/lib/database.types";
import { analystOutputSchema, type Insight } from "./schema";
import { AnalystValidationError, checkAnalystOutput } from "./validate";

const dateOnly = (d: Date) => `${d.toISOString().slice(0, 10)}T00:00:00Z`;

type RunResult = { outcome: "ok" | "validation_failed" | "error"; usage?: { inputTokens?: number; outputTokens?: number }; providerMetadata?: unknown; latencyMs: number; error?: string };

/**
 * One structured call, checked in code, retried once if it fails validation. Works in memory,
 * so the evals run exactly what production runs.
 */
export async function analyseTranscript(
  deps: { model: LanguageModelV4; instructions: string },
  context: Record<string, unknown>,
  learnerTurns: string[],
  isPrivate: boolean,
): Promise<{ insight: Insight | null; runs: RunResult[]; fatal?: Error }> {
  const runs: RunResult[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = performance.now();
    try {
      const result = await generateText({
        model: deps.model,
        instructions: deps.instructions,
        prompt: `Analyse this interview.\n\n<context>${JSON.stringify(context)}</context>`,
        output: Output.object({ schema: analystOutputSchema }),
        maxOutputTokens: 2000,
      });
      const checked = checkAnalystOutput(analystOutputSchema.parse(result.output), learnerTurns, { private: isPrivate });
      runs.push({ outcome: "ok", usage: result.usage, providerMetadata: result.providerMetadata, latencyMs: performance.now() - started });
      return { insight: checked.insight, runs };
    } catch (err) {
      const validation = err instanceof AnalystValidationError || (err instanceof Error && /NoObjectGenerated|TypeValidation|JSONParse|ZodError/.test(err.name));
      runs.push({ outcome: validation ? "validation_failed" : "error", latencyMs: performance.now() - started, error: errorName(err) });
      if (!validation) return { insight: null, runs, fatal: err as Error };
    }
  }
  return { insight: null, runs };
}

/**
 * Job: one structured call per submitted interview. A failed output is retried once; after a
 * second failure the interview is marked needs_review. Private interviews keep paraphrases only,
 * and their transcript is deleted when the Analyst finishes.
 */
export async function analyseInterview(payload: { interview_id: string }, deps: JobDeps): Promise<"analysed" | "needs_review" | "skipped"> {
  const db = deps.admin;
  const { data: iv } = await db.from("interviews").select("*").eq("id", payload.interview_id).maybeSingle();
  if (!iv || iv.state !== "submitted") return "skipped";
  const { data: turns } = await db.from("interview_turns").select("role, text, stage").eq("interview_id", iv.id).order("seq");
  const conversation = (turns ?? []).filter((t) => t.stage !== "consent");
  const learnerTurns = conversation.filter((t) => t.role === "learner").map((t) => t.text);
  const agent = loadAgentFile("analyst");
  const model = modelIdFor("analyst");
  const isPrivate = iv.anonymity === "private";
  const meta = {
    organizationId: iv.organization_id,
    agent: "analyst" as const,
    agentVersion: agent.version,
    model,
    operation: "analyse_interview",
    interviewId: iv.id,
    sessionId: iv.session_id,
    learnerId: iv.anonymity === "named" ? iv.participant_id : null,
  };
  const context = {
    task: "analyse_interview",
    kind: iv.kind,
    confirmed_summary: iv.summary,
    learner_turns: learnerTurns,
    transcript: conversation.map((t) => ({ speaker: t.role === "learner" ? "Learner" : "Interviewer", text: t.text })),
  };

  const analysed = await analyseTranscript({ model: languageModel("analyst"), instructions: agent.instructions }, context, learnerTurns, isPrivate);
  for (const r of analysed.runs) await recordRun(db, meta, r);
  const insight = analysed.insight;
  if (analysed.fatal) throw analysed.fatal;

  const named = iv.anonymity === "named";
  const now = deps.now();
  if (!insight) {
    await db.from("interviews").update({ state: "needs_review", analysis_attempts: 2 }).eq("id", iv.id);
  } else {
    const { error } = await db.from("insights").insert({
      organization_id: iv.organization_id,
      course_id: iv.course_id,
      session_id: iv.session_id,
      interview_id: iv.id,
      kind: iv.kind,
      themes: insight.themes as unknown as Json,
      blockers: insight.blockers,
      suggestions: insight.suggestions,
      quotes: (isPrivate ? [] : insight.quotes) as unknown as Json,
      paraphrases: insight.paraphrases as unknown as Json,
      agent_version: agent.version,
      created_at: named ? now.toISOString() : dateOnly(now),
    });
    if (error) throw new Error(`store insights: ${error.code}`);
    await db
      .from("interviews")
      .update({ state: "analysed", analysed_at: named ? now.toISOString() : dateOnly(now), analysis_attempts: 1 })
      .eq("id", iv.id);
  }

  if (isPrivate) {
    // Private: nothing individual is kept once the Analyst has finished.
    await db.from("interview_turns").delete().eq("interview_id", iv.id);
    await db.from("interviews").update({ summary: null }).eq("id", iv.id);
  }

  await enqueue(db, { kind: "session_summary", payload: { session_id: iv.session_id, kind: iv.kind }, organizationId: iv.organization_id, runAfter: new Date(now.getTime() + 5_000) });
  await enqueue(db, { kind: "score_interview", payload: { interview_id: iv.id }, organizationId: iv.organization_id });
  return insight ? "analysed" : "needs_review";
}
