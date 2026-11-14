import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCourse } from "@/lib/course";
import { requestCtx } from "@/lib/server/route";
import { courseTrend } from "@/lib/server/dashboard";
import { SESSION_STATE_LABEL, formatDate } from "@/lib/labels";
import { Badge, Card, PageTitle } from "@/components/ui";
import { TrendChart } from "@/components/dashboard/charts";
import { followUpWindow } from "@/lib/server/follow-up";
import { adminClient } from "@/lib/server/supabase-admin";
import { getFollowUpResults } from "@/lib/server/ops/results";

export default async function DashboardPage({ params }: PageProps<"/[org]/[course]/dashboard">) {
  const { org, course } = await params;
  const ctx = await requireCourse(org, course);
  if (!ctx.can.readResults) notFound();
  const req = await requestCtx();
  const [{ data: sessions }, { data: counts }, trend] = await Promise.all([
    req.db.from("sessions").select("id, number, title, date, state").eq("course_id", ctx.course.id).neq("state", "draft").order("number"),
    req.db.rpc("session_response_counts", { p_course: ctx.course.id }),
    courseTrend(req, ctx.course.id),
  ]);
  const byId = new Map((counts ?? []).map((c) => [c.session_id, c]));
  const window = await followUpWindow(adminClient(), ctx.course.id, new Date());
  const followUp = window.sessionId ? await getFollowUpResults(req, window.sessionId) : null;
  return (
    <>
      <PageTitle title="Dashboard" subtitle={ctx.course.title} />
      <div className="grid gap-6">
        {followUp && followUp.responses > 0 ? (
          <Card data-testid="tile-applied">
            <p className="text-sm text-muted">Applied at work · from the follow-up interview</p>
            {followUp.hidden ? (
              <p className="mt-1">Results appear once {followUp.min_group_size} learners have responded. {followUp.responses} so far.</p>
            ) : (
              <>
                <p className="mt-1 text-3xl font-semibold" data-testid="tile-applied-value">
                  {followUp.tiles!.applied!.count} of {followUp.tiles!.applied!.of}
                </p>
                <p className="text-sm text-muted">said they have used it at work</p>
              </>
            )}
          </Card>
        ) : null}
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Sessions</h2>
          <ul className="divide-y divide-border">
            {(sessions ?? []).map((s) => {
              const c = byId.get(s.id);
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <Link href={`/${org}/${course}/dashboard/sessions/${s.number}`} className="font-medium">
                      Session {s.number}: {s.title}
                    </Link>
                    <p className="text-sm text-muted">{formatDate(s.date)}</p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span>{c?.responses ?? 0} of {c?.enrolled ?? 0} responded</span>
                    <Badge>{SESSION_STATE_LABEL[s.state]}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        {trend.length ? <TrendChart data={trend} /> : null}
      </div>
    </>
  );
}
