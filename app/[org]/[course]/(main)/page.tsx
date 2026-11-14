import Link from "next/link";
import { requireCourse } from "@/lib/course";
import { createUserClient } from "@/lib/supabase/server";
import { SESSION_STATE_LABEL, formatDate } from "@/lib/labels";
import { followUpWindow } from "@/lib/server/follow-up";
import { adminClient } from "@/lib/server/supabase-admin";
import { Badge, Card, LinkButton, PageTitle } from "@/components/ui";
import { MyData } from "@/components/course/my-data";

export default async function CourseHome({ params }: PageProps<"/[org]/[course]">) {
  const { org, course } = await params;
  const ctx = await requireCourse(org, course);
  const db = await createUserClient();
  const { data: sessions } = await db
    .from("sessions")
    .select("id, number, title, date, state")
    .eq("course_id", ctx.course.id)
    .order("number");
  const followUp = ctx.can.learn ? await followUpWindow(adminClient(), ctx.course.id, new Date()) : null;
  const { data: followUpDone } =
    followUp?.open && followUp.sessionId
      ? await db.from("completions").select("id").eq("session_id", followUp.sessionId).eq("user_id", ctx.userId).eq("kind", "follow_up").maybeSingle()
      : { data: null };

  return (
    <>
      <PageTitle title={ctx.course.title} subtitle={ctx.course.description || undefined} />
      {followUp?.open && !followUpDone ? (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4" data-testid="follow-up">
          <div>
            <h2 className="text-lg font-semibold">Has the course helped at work?</h2>
            <p className="text-sm text-muted">A five-minute follow-up: what you&apos;ve used since, and what got in the way.</p>
          </div>
          <LinkButton href={`/${org}/${course}/sessions/${followUp.sessionNumber}/interview?kind=follow_up`}>Take the follow-up</LinkButton>
        </Card>
      ) : null}
      <h2 className="mb-3 text-lg font-semibold">Sessions</h2>
      <ul className="space-y-3" data-testid="session-list">
        {(sessions ?? []).map((s) => (
          <li key={s.id}>
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link href={`/${org}/${course}/sessions/${s.number}`} className="text-lg font-medium">
                  Session {s.number}: {s.title}
                </Link>
                <p className="text-sm text-muted">{formatDate(s.date)}</p>
              </div>
              <Badge tone={s.state === "open" ? "primary" : "neutral"}>{SESSION_STATE_LABEL[s.state]}</Badge>
            </Card>
          </li>
        ))}
      </ul>
      {(sessions ?? []).length === 0 ? <p className="text-muted">No sessions yet.</p> : null}
      {ctx.can.learn ? (
        <div className="mt-10 border-t border-border pt-4">
          <h2 className="mb-1 text-sm font-semibold">Your data</h2>
          <MyData courseId={ctx.course.id} />
        </div>
      ) : null}
    </>
  );
}
