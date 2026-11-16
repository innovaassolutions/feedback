import { publicEnv } from "@/lib/env";
import { PLATFORM_BRAND } from "@/lib/server/mail/brand";
import { brandedEmail } from "@/lib/server/mail/layout";
import type { JobDeps } from "@/lib/server/jobs/queue";
import { markOnce } from "@/lib/server/jobs/queue";
import type { Json } from "@/lib/database.types";
import { languageModel } from "@/lib/server/ai/models";
import { modelIdFor } from "@/lib/server/ai/provider";
import { loadAgentFile } from "@/lib/server/ai/agent-file";
import { recordRun } from "@/lib/server/ai/runs";
import type { Progress } from "@/agents/interviewer/schema";
import { codeChecks, judgeTranscript, JUDGE_VERSION, type RubricResult, type TranscriptTurn } from "./rubric";

/**
 * Job: score a submitted interview against the rubric. Named and anonymous interviews get every
 * item; a private interview gets only the items checked in code, because its transcript is gone.
 */
export async function scoreInterview(payload: { interview_id: string }, deps: JobDeps) {
  const db = deps.admin;
  const { data: iv } = await db.from("interviews").select("*").eq("id", payload.interview_id).maybeSingle();
  if (!iv || !["submitted", "analysed", "needs_review"].includes(iv.state)) return null;
  const { data: course } = await db.from("courses").select("max_turns").eq("id", iv.course_id).single();
  const progress = iv.progress as unknown as Progress;
  const results: RubricResult[] = codeChecks({
    progress,
    turnCount: iv.turn_count,
    maxTurns: course?.max_turns ?? 14,
    reachedReadBackAt: progress.read_back_turn ?? null,
  });
  const codeOnly = iv.anonymity === "private";
  if (!codeOnly) {
    const { data: turns } = await db.from("interview_turns").select("role, text, stage, mode").eq("interview_id", iv.id).order("seq");
    const transcript = (turns ?? []) as TranscriptTurn[];
    const started = performance.now();
    const judged = await judgeTranscript(languageModel("judge"), transcript, (iv.summary as string[] | null) ?? null);
    await recordRun(
      db,
      {
        organizationId: iv.organization_id,
        agent: "judge",
        agentVersion: JUDGE_VERSION,
        model: modelIdFor("judge"),
        operation: "score_interview",
        interviewId: iv.id,
        sessionId: iv.session_id,
        learnerId: iv.anonymity === "named" ? iv.participant_id : null,
      },
      { outcome: judged.error ? "validation_failed" : "ok", usage: judged.usage, providerMetadata: judged.providerMetadata, latencyMs: performance.now() - started, error: judged.error },
    );
    results.push(...judged.results);
  }
  const passed = results.filter((r) => r.passed).length;
  await db.from("quality_checks").insert({
    organization_id: iv.organization_id,
    interview_id: iv.id,
    session_id: iv.session_id,
    agent: "interviewer",
    agent_version: iv.agent_version ?? loadAgentFile("interviewer").version,
    kind: "rubric",
    items: results as unknown as Json,
    passed,
    total: results.length,
    code_only: codeOnly,
  });
  return { results, codeOnly };
}

export const RUBRIC_ALERT = 0.85;
export const VALIDATION_ALERT = 0.05;

/** Emails the platform admin when the seven-day rubric pass rate or validation failures cross the marks. */
export async function checkAlerts(deps: JobDeps) {
  const now = deps.now();
  const { data } = await deps.admin.rpc("seven_day_quality", { p_now: now.toISOString() });
  const q = data as { rubric_passed: number; rubric_total: number; runs: number; validation_failures: number };
  const alerts: string[] = [];
  if (q.rubric_total > 0 && q.rubric_passed / q.rubric_total < RUBRIC_ALERT) {
    alerts.push(`The interview rubric pass rate over the last seven days is ${Math.round((q.rubric_passed / q.rubric_total) * 100)}%, under the ${RUBRIC_ALERT * 100}% mark.`);
  }
  if (q.runs > 0 && q.validation_failures / q.runs > VALIDATION_ALERT) {
    alerts.push(`Agent output failed validation in ${Math.round((q.validation_failures / q.runs) * 100)}% of calls over the last seven days, over the ${VALIDATION_ALERT * 100}% mark.`);
  }
  if (!alerts.length) return [];
  // One alert email a day at most.
  if (!(await markOnce(deps.admin, `alert:${now.toISOString().slice(0, 10)}`, null, "alert_sent"))) return [];
  const { data: emails } = await deps.admin.rpc("platform_admin_emails");
  for (const to of (emails as string[] | null) ?? []) {
    await deps.mailer.send(
      brandedEmail(to, "Agent quality alert", PLATFORM_BRAND, {
        preview: alerts[0],
        heading: "Agent quality alert",
        body: [...alerts, "See the quality page for figures by agent and AGENT.md version."],
        button: { label: "Open the quality page", url: `${publicEnv.appUrl}/platform/quality` },
      }),
    );
  }
  return alerts;
}
