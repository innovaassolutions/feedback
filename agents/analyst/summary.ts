import { generateText, Output } from "ai";
import type { JobDeps } from "@/lib/server/jobs/queue";
import { languageModel } from "@/lib/server/ai/models";
import { modelIdFor } from "@/lib/server/ai/provider";
import { loadAgentFile } from "@/lib/server/ai/agent-file";
import { errorName, recordRun } from "@/lib/server/ai/runs";
import { ableToApply, allowedNumbers, onlyAllowedNumbers, paceAboutRight, recommend, themeMentions, type RatingRow, type ThemeRow } from "@/lib/metrics";
import { sessionSummarySchema } from "./schema";

export type SummaryNumbers = {
  session_number: number;
  responses: number;
  enrolled: number;
  able_to_apply: number;
  able_to_apply_pct: number | null;
  pace_about_right: number;
  pace_about_right_pct: number | null;
  recommend_average: number | null;
  applied_at_work: number | null;
};

export function templateSummary(n: SummaryNumbers, topThemes: string[]): string {
  const parts = [`${n.responses} of ${n.enrolled} learners responded.`];
  if (n.applied_at_work !== null) parts.push(`${n.applied_at_work} of ${n.responses} said they had used it at work.`);
  else {
    parts.push(`${n.able_to_apply} of ${n.responses} said they could apply what was taught.`);
    parts.push(`${n.pace_about_right} of ${n.responses} said the pace was about right.`);
  }
  if (n.recommend_average !== null) parts.push(`The average recommendation was ${n.recommend_average} out of 10.`);
  if (topThemes.length) parts.push(`Learners talked most about ${topThemes.slice(0, 2).join(" and ").toLowerCase()}.`);
  return parts.join(" ");
}

/**
 * Checks the Analyst's session summary: code computes every number and passes it in. If the
 * text contains any number that wasn't passed in, the template summary is used instead.
 */
export function chooseSummary(text: string | null, numbers: SummaryNumbers, topThemes: string[]): { text: string; source: "analyst" | "template" } {
  const allowed = allowedNumbers([...Object.values(numbers), 10]);
  if (text && onlyAllowedNumbers(text, allowed)) return { text, source: "analyst" };
  return { text: templateSummary(numbers, topThemes), source: "template" };
}

/** Job: rewrite a session's dashboard summary after a new interview is analysed. */
export async function writeSessionSummary(payload: { session_id: string; kind?: "session" | "follow_up" }, deps: JobDeps) {
  const db = deps.admin;
  const kind = payload.kind ?? "session";
  if (kind !== "session") return null; // the follow-up has its own tile, not a summary
  const { data: session } = await db.from("sessions").select("id, organization_id, course_id, number").eq("id", payload.session_id).single();
  if (!session) return null;
  const [{ data: course }, { data: interviews }, { count: enrolled }] = await Promise.all([
    db.from("courses").select("min_group_size").eq("id", session.course_id).single(),
    db.from("interviews").select("id").eq("session_id", session.id).eq("kind", kind).in("state", ["submitted", "analysed", "needs_review"]),
    db.from("enrollments").select("id", { count: "exact", head: true }).eq("course_id", session.course_id),
  ]);
  const responses = interviews?.length ?? 0;
  if (!course || responses < course.min_group_size) return null;
  const ids = (interviews ?? []).map((i) => i.id);
  const [{ data: ratings }, { data: insights }] = await Promise.all([
    db.from("ratings").select("item_id, choice").in("interview_id", ids),
    db.from("insights").select("themes, blockers, suggestions").in("interview_id", ids),
  ]);
  const rows = (ratings ?? []) as RatingRow[];
  const themes = (insights ?? []).flatMap((i) => i.themes as unknown as ThemeRow[]);
  const able = ableToApply(rows, responses);
  const pace = paceAboutRight(rows, responses);
  const numbers: SummaryNumbers = {
    session_number: session.number,
    responses,
    enrolled: enrolled ?? 0,
    able_to_apply: able.count,
    able_to_apply_pct: able.pct,
    pace_about_right: pace.count,
    pace_about_right_pct: pace.pct,
    recommend_average: recommend(rows).average,
    applied_at_work: null,
  };
  const mentions = themeMentions(themes).sort((a, b) => b.positive + b.negative - (a.positive + a.negative));
  const topThemes = mentions.map((m) => m.theme);

  const agent = loadAgentFile("analyst");
  const started = performance.now();
  let text: string | null = null;
  const meta = { organizationId: session.organization_id, agent: "analyst" as const, agentVersion: agent.version, model: modelIdFor("analyst"), operation: "session_summary", sessionId: session.id };
  try {
    const result = await generateText({
      model: languageModel("analyst"),
      instructions: agent.instructions,
      prompt: `Task: session_summary\n\n<context>${JSON.stringify({
        task: "session_summary",
        numbers,
        top_themes: topThemes,
        theme_mentions: mentions,
        blockers: (insights ?? []).flatMap((i) => i.blockers as string[]).slice(0, 20),
        suggestions: (insights ?? []).flatMap((i) => i.suggestions as string[]).slice(0, 20),
      })}</context>`,
      output: Output.object({ schema: sessionSummarySchema }),
      maxOutputTokens: 600,
    });
    text = sessionSummarySchema.parse(result.output).summary;
    const chosen = chooseSummary(text, numbers, topThemes);
    await recordRun(db, meta, { outcome: chosen.source === "analyst" ? "ok" : "validation_failed", usage: result.usage, providerMetadata: result.providerMetadata, latencyMs: performance.now() - started, error: chosen.source === "template" ? "NumberNotPassedIn" : undefined });
  } catch (err) {
    await recordRun(db, meta, { outcome: "validation_failed", latencyMs: performance.now() - started, error: errorName(err) });
  }
  const chosen = chooseSummary(text, numbers, topThemes);
  await db.from("sessions").update({ summary: chosen.text, summary_source: chosen.source, summary_at: deps.now().toISOString() }).eq("id", session.id);
  return chosen;
}
