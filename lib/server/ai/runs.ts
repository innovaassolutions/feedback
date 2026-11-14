import type { AdminClient } from "@/lib/server/supabase-admin";
import type { AgentName } from "./provider";

export type RunMeta = {
  organizationId: string;
  agent: AgentName;
  agentVersion: string;
  model: string;
  operation: string;
  interviewId?: string | null;
  sessionId?: string | null;
  questionId?: string | null;
  /** Only for named interviews and named questions. Leave null otherwise. */
  learnerId?: string | null;
};

export type RunOutcome = "ok" | "validation_failed" | "error";

type UsageLike = { inputTokens?: number; outputTokens?: number } | undefined;

export function costOf(model: string, usage: UsageLike, providerMetadata?: unknown): number {
  const reported = Number((providerMetadata as { gateway?: { cost?: unknown } } | undefined)?.gateway?.cost);
  if (Number.isFinite(reported) && reported > 0) return reported;
  if (model.startsWith("stub/")) return 0;
  const inPrice = Number(process.env.AI_PRICE_INPUT_PER_MTOK ?? 3);
  const outPrice = Number(process.env.AI_PRICE_OUTPUT_PER_MTOK ?? 15);
  return ((usage?.inputTokens ?? 0) * inPrice + (usage?.outputTokens ?? 0) * outPrice) / 1_000_000;
}

/** Writes one agent_runs row. Never includes prompt or transcript text. */
export async function recordRun(
  db: AdminClient,
  meta: RunMeta,
  result: { outcome: RunOutcome; usage?: UsageLike; providerMetadata?: unknown; latencyMs: number; error?: string },
) {
  const { error } = await db.from("agent_runs").insert({
    organization_id: meta.organizationId,
    agent: meta.agent,
    agent_version: meta.agentVersion,
    model: meta.model,
    operation: meta.operation,
    interview_id: meta.interviewId ?? null,
    session_id: meta.sessionId ?? null,
    question_id: meta.questionId ?? null,
    learner_id: meta.learnerId ?? null,
    input_tokens: Math.round(result.usage?.inputTokens ?? 0),
    output_tokens: Math.round(result.usage?.outputTokens ?? 0),
    cost_usd: costOf(meta.model, result.usage, result.providerMetadata),
    latency_ms: Math.round(result.latencyMs),
    outcome: result.outcome,
    // Error messages are kept short and never carry learner text.
    error: result.error ? result.error.slice(0, 300) : null,
  });
  if (error) console.error("agent_runs insert failed", error.message);
}

/** Times an agent call and records it whatever happens. */
export async function trackRun<T>(
  db: AdminClient,
  meta: RunMeta,
  fn: () => Promise<{ value: T; usage?: UsageLike; providerMetadata?: unknown; outcome?: RunOutcome; error?: string }>,
): Promise<T> {
  const started = performance.now();
  try {
    const r = await fn();
    await recordRun(db, meta, {
      outcome: r.outcome ?? "ok",
      usage: r.usage,
      providerMetadata: r.providerMetadata,
      latencyMs: performance.now() - started,
      error: r.error,
    });
    return r.value;
  } catch (err) {
    await recordRun(db, meta, { outcome: "error", latencyMs: performance.now() - started, error: errorName(err) });
    throw err;
  }
}

/**
 * The error's name only. Model validation errors quote the model's output in their message,
 * and that output can contain transcript text, which must never be logged.
 */
export function errorName(err: unknown): string {
  if (err instanceof Error) return err.name.slice(0, 100);
  return "UnknownError";
}
