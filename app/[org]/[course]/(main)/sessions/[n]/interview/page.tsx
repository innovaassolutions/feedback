import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { requireCourse } from "@/lib/course";
import { createUserClient } from "@/lib/supabase/server";
import { requestCtx } from "@/lib/server/route";
import { resumeInterview } from "@/lib/server/ops/interviews";
import { followUpWindow } from "@/lib/server/follow-up";
import { adminClient } from "@/lib/server/supabase-admin";
import { Card, PageTitle } from "@/components/ui";
import { InterviewApp } from "@/components/interview/interview-app";
import { voiceConfigured } from "@/lib/server/voice";

function idFromCookie(name: string): string | null {
  const hex = name.slice(3);
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default async function InterviewPage({ params, searchParams }: PageProps<"/[org]/[course]/sessions/[n]/interview">) {
  const { org, course, n } = await params;
  const kind = (await searchParams).kind === "follow_up" ? "follow_up" : "session";
  const ctx = await requireCourse(org, course);
  const db = await createUserClient();
  const { data: session } = await db
    .from("sessions")
    .select("id, number, title, state")
    .eq("course_id", ctx.course.id)
    .eq("number", Number(n))
    .maybeSingle();
  if (!session) notFound();
  const back = `/${org}/${course}/sessions/${session.number}`;
  const title = kind === "follow_up" ? "Follow-up interview" : "Feedback interview";
  const subtitle = `Session ${session.number}: ${session.title}`;

  const store = await cookies();
  const ids = store.getAll().map((c) => (c.name.startsWith("iv_") ? idFromCookie(c.name) : null)).filter((x): x is string => Boolean(x));
  const resumed = ids.length ? await resumeInterview(await requestCtx(), ids, session.id, kind) : null;

  const message = async (): Promise<string | null> => {
    if (resumed) return null;
    if (!ctx.can.learn) return "Only learners enrolled in this course give feedback. Instructors see the results on the dashboard.";
    const { data: done } = await db.from("completions").select("id").eq("session_id", session.id).eq("user_id", ctx.userId).eq("kind", kind).maybeSingle();
    if (done) return "You've already given this feedback. Thank you.";
    if (kind === "session" && session.state !== "open") return "Feedback isn't open for this session.";
    if (kind === "follow_up") {
      const window = await followUpWindow(adminClient(), ctx.course.id, new Date());
      if (!window.open || window.sessionId !== session.id) return "The follow-up interview isn't open yet.";
    }
    return null;
  };
  const blocked = await message();

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title={title} subtitle={subtitle} actions={<Link href={back}>Back to the session</Link>} />
      {blocked ? (
        <Card>
          <p>{blocked}</p>
        </Card>
      ) : (
        <InterviewApp sessionId={session.id} kind={kind} initial={resumed} voiceEnabled={voiceConfigured()} />
      )}
    </div>
  );
}
