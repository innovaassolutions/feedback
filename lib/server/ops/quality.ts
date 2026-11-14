import type { Ctx } from "@/lib/server/ctx";
import { requireUser } from "@/lib/server/ctx";
import { forbidden, notFound, unprocessable } from "@/lib/server/http";
import { enqueue } from "@/lib/server/jobs/queue";
import { openRef } from "@/lib/server/refs";
import { isInstructor, kickJobs } from "./common";

type Figures = {
  runs: Array<{ agent: string; version: string; runs: number; validation_failures: number; errors: number; cost_usd: number; median_latency_ms: number }>;
  rubric: Array<{ agent: string; version: string; passed: number; total: number; interviews: number; code_only: number }>;
  interviews: Array<{ version: string; started: number; submitted: number; abandoned: number; needs_review: number; confirmed_without_edits: number; median_turns: number | null; rated_helpful: number; rated: number }>;
  cost_per_interview: Array<{ version: string; cost_usd: number }>;
  answers: Array<{ version: string; ai_answers: number; verified_without_edits: number; verified: number }>;
  questions: Array<{ version: string; questions: number; not_covered: number }>;
  review_queue: number;
  candidates: Array<{ insight_id: string; course: string; session: number; analyst_version: string; marked_on: string }>;
};

export type QualityRow = {
  agent: string;
  version: string;
  runs: number;
  validation_failure_rate: number | null;
  rubric_pass_rate: number | null;
  read_backs_confirmed_without_edits: number | null;
  abandon_rate: number | null;
  median_turns: number | null;
  cost_per_interview_usd: number | null;
  ai_answers_verified_without_edits: number | null;
  questions_sources_could_not_answer: number | null;
};

const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 1000 : null);

/** Agent quality figures by agent and AGENT.md version. Platform admins only. */
export async function getQuality(ctx: Ctx) {
  requireUser(ctx);
  const { data } = await ctx.db.rpc("quality_figures");
  if (!data) throw forbidden("The quality page is for the platform admin");
  const f = data as unknown as Figures;
  const rows: QualityRow[] = f.runs.map((r) => {
    const rubric = f.rubric.find((x) => x.agent === r.agent && x.version === r.version);
    const iv = r.agent === "interviewer" ? f.interviews.find((x) => x.version === r.version) : undefined;
    const cost = r.agent === "interviewer" ? f.cost_per_interview.find((x) => x.version === r.version) : undefined;
    const answers = r.agent === "librarian" ? f.answers.find((x) => x.version === r.version) : undefined;
    const questions = r.agent === "librarian" ? f.questions.find((x) => x.version === r.version) : undefined;
    return {
      agent: r.agent,
      version: r.version,
      runs: r.runs,
      validation_failure_rate: rate(r.validation_failures, r.runs),
      rubric_pass_rate: rubric ? rate(rubric.passed, rubric.total) : null,
      read_backs_confirmed_without_edits: iv ? rate(iv.confirmed_without_edits, iv.submitted) : null,
      abandon_rate: iv ? rate(iv.abandoned, iv.started) : null,
      median_turns: iv?.median_turns ?? null,
      cost_per_interview_usd: cost ? Math.round(cost.cost_usd * 10000) / 10000 : null,
      ai_answers_verified_without_edits: answers ? rate(answers.verified_without_edits, answers.ai_answers) : null,
      questions_sources_could_not_answer: questions ? rate(questions.not_covered, questions.questions) : null,
    };
  });
  return { rows, review_queue: f.review_queue, candidates: f.candidates };
}

/** An instructor marks an interview's insights Accurate or Not accurate. */
export async function markInsightAccuracy(ctx: Ctx, ref: string, accuracy: "accurate" | "not_accurate") {
  const user = requireUser(ctx);
  const id = openRef(ref);
  if (!id) throw notFound("Interview not found");
  // Row Level Security decides: only an instructor who may read this interview can mark it.
  const { data, error } = await ctx.db
    .from("insights")
    .update({ accuracy, accuracy_marked_by: user.id, accuracy_marked_at: ctx.now().toISOString() })
    .eq("interview_id", id)
    .select("id");
  if (error) throw new Error(`mark accuracy: ${error.message}`);
  if (!data?.length) throw notFound("Interview not found");
  return { accuracy };
}

/** From the review queue: run the Analyst again on an interview that failed validation twice. */
export async function retryAnalysis(ctx: Ctx, ref: string) {
  requireUser(ctx);
  const id = openRef(ref);
  if (!id) throw notFound("Interview not found");
  const { data: iv } = await ctx.db.from("interviews").select("id, course_id, state, organization_id").eq("id", id).maybeSingle();
  if (!iv) throw notFound("Interview not found");
  if (!(await isInstructor(ctx, iv.course_id))) throw forbidden("Only the course's instructors can do this");
  if (iv.state !== "needs_review") throw unprocessable("Only interviews that need review can be analysed again");
  await ctx.admin.from("interviews").update({ state: "submitted" }).eq("id", iv.id);
  await enqueue(ctx.admin, { kind: "analyse_interview", payload: { interview_id: iv.id }, organizationId: iv.organization_id });
  kickJobs(ctx);
  return { state: "submitted" };
}

/** A learner's request: remove their named interviews and their questions in a course. */
export async function deleteMyData(ctx: Ctx, courseId: string) {
  requireUser(ctx);
  const { data, error } = await ctx.db.rpc("delete_my_data", { p_course: courseId });
  if (error) throw new Error(`delete my data: ${error.message}`);
  return data as { interviews: number; questions: number };
}
