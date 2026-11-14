import "server-only";
import { requestCtx } from "@/lib/server/route";
import { resultsFor, type SessionResults } from "@/lib/server/ops/results";
import type { TrendPoint } from "@/components/dashboard/charts";
import type { Ctx } from "@/lib/server/ctx";
import { qaStats, type QaStats } from "@/lib/metrics";

/** Q&A figures per delivered session, from the questions the user can see. */
export async function questionStats(ctx: Ctx, courseId: string) {
  const { data: sessions } = await ctx.db.from("sessions").select("id, number").eq("course_id", courseId).in("state", ["open", "closed"]).order("number");
  const { data: rows } = await ctx.db.from("questions").select("session_id, state, created_at, first_answered_at, sent_to_instructor_at").eq("course_id", courseId);
  const bySession = new Map<string, QaStats>();
  for (const s of sessions ?? []) bySession.set(s.id, qaStats((rows ?? []).filter((r) => r.session_id === s.id)));
  return {
    bySession,
    chart: (sessions ?? []).map((s) => ({ session: `S${s.number}`, open: bySession.get(s.id)!.open, answered: bySession.get(s.id)!.answered })),
  };
}

/** The trend across a course's delivered sessions. Hidden sessions show only their count. */
export async function courseTrend(ctx: Ctx, courseId: string): Promise<TrendPoint[]> {
  const { data: sessions } = await ctx.db.from("sessions").select("id, number, state").eq("course_id", courseId).in("state", ["open", "closed"]).order("number");
  const out: TrendPoint[] = [];
  for (const s of sessions ?? []) {
    const r = await resultsFor(ctx, s.id, "session");
    out.push({
      session: `S${s.number}`,
      responses: r.responses,
      able_pct: r.tiles?.able.pct ?? null,
      pace_pct: r.tiles?.pace.pct ?? null,
      recommend: r.tiles?.recommend.average ?? null,
    });
  }
  return out;
}

export async function sessionDashboard(courseId: string, number: number) {
  const ctx = await requestCtx();
  const { data: session } = await ctx.db.from("sessions").select("id, number, title, date, state").eq("course_id", courseId).eq("number", number).maybeSingle();
  if (!session) return null;
  const [results, trend, qa, { data: actions }] = await Promise.all([
    resultsFor(ctx, session.id, "session"),
    courseTrend(ctx, courseId),
    questionStats(ctx, courseId),
    ctx.db.from("actions").select("id, you_said, we_did, status, created_at").eq("session_id", session.id).order("created_at"),
  ]);
  return { ctx, session, results, trend, qa: { stats: qa.bySession.get(session.id) ?? null, chart: qa.chart }, actions: actions ?? [] };
}

export type { SessionResults };
