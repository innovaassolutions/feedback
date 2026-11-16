import { notFound } from "next/navigation";
import { requireCourse } from "@/lib/course";
import { createUserClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/request";
import { SESSION_STATE_LABEL, formatDate } from "@/lib/labels";
import { Badge, Card, LinkButton, PageTitle } from "@/components/ui";
import { JoinLink } from "@/components/join-link";
import { QaBoard } from "@/components/qa/board";
import { requestCtx } from "@/lib/server/route";
import { listQuestions } from "@/lib/server/ops/questions";

export default async function SessionPage({ params }: PageProps<"/[org]/[course]/sessions/[n]">) {
  const { org, course, n } = await params;
  const ctx = await requireCourse(org, course);
  const number = Number(n);
  if (!Number.isInteger(number) || number < 1) notFound();
  const db = await createUserClient();
  const { data: session } = await db
    .from("sessions")
    .select("id, number, title, date, state, objectives")
    .eq("course_id", ctx.course.id)
    .eq("number", number)
    .maybeSingle();
  if (!session) notFound();
  // Row Level Security leaves out agents-only documents for learners and sponsors.
  const { data: documents } = await db
    .from("documents")
    .select("id, title, audience, status, file_name")
    .eq("session_id", session.id)
    .order("created_at");
  const materials = (documents ?? []).filter((d) => d.audience === "learners");
  // "You said, we did": what changed because of feedback on the previous session.
  const { data: previous } = session.number > 1
    ? await db.from("sessions").select("id, number").eq("course_id", ctx.course.id).eq("number", session.number - 1).maybeSingle()
    : { data: null };
  const { data: changes } = previous
    ? await db.from("actions").select("id, you_said, we_did, status").eq("session_id", previous.id).order("created_at")
    : { data: [] };
  const base = `/${org}/${course}/sessions/${session.number}`;
  const qaOpen = session.state === "open" || session.state === "closed";
  const questions = qaOpen ? (await listQuestions(await requestCtx(), { session_id: session.id })).questions : [];
  const { data: completion } = ctx.can.learn
    ? await db.from("completions").select("id").eq("session_id", session.id).eq("user_id", ctx.userId).eq("kind", "session").maybeSingle()
    : { data: null };

  return (
    <>
      <PageTitle
        title={`Session ${session.number}: ${session.title}`}
        subtitle={formatDate(session.date)}
        actions={<Badge tone={session.state === "open" ? "primary" : "neutral"}>{SESSION_STATE_LABEL[session.state]}</Badge>}
      />
      <div className="grid gap-6">
        {ctx.can.learn && session.state === "open" ? (
          <Card className="flex flex-wrap items-center justify-between gap-4" data-testid="give-feedback">
            <div>
              <h2 className="text-lg font-semibold">{completion ? "Thanks for your feedback" : "How did this session go?"}</h2>
              <p className="text-sm text-muted">
                {completion ? "You've given feedback on this session." : "A five-minute conversation. You choose how anonymous to be."}
              </p>
            </div>
            {completion ? null : <LinkButton href={`${base}/interview`}>Give feedback</LinkButton>}
          </Card>
        ) : null}
        {session.objectives ? (
          <Card>
            <h2 className="mb-2 text-lg font-semibold">What this session covers</h2>
            <p className="whitespace-pre-line text-muted">{session.objectives}</p>
          </Card>
        ) : null}
        {changes?.length ? (
          <Card data-testid="you-said-we-did">
            <h2 className="mb-3 text-lg font-semibold">You said, we did</h2>
            <p className="mb-3 text-sm text-muted">What changed because of feedback on Session {previous!.number}.</p>
            <ul className="space-y-2">
              {changes.map((a) => (
                <li key={a.id} className="rounded-theme border border-border p-3">
                  <p><span className="font-medium">You said:</span> {a.you_said}</p>
                  <p><span className="font-medium">We did:</span> {a.we_did}</p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Materials</h2>
          {materials.length ? (
            <ul className="space-y-2" data-testid="materials">
              {materials.map((d) => (
                <li key={d.id}>
                  <a href={`/api/documents/${d.id}/download`}>{d.title}</a>
                  <span className="ml-2 text-sm text-muted">{d.file_name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No materials for this session yet.</p>
          )}
        </Card>
        {qaOpen ? (
          <Card>
            <h2 className="mb-3 text-lg font-semibold">Questions</h2>
            <QaBoard sessionId={session.id} canAsk={ctx.can.learn} isInstructor={ctx.can.answerQuestions} initial={questions} />
          </Card>
        ) : null}
        {ctx.can.manage ? (
          <Card>
            <h2 className="mb-3 text-lg font-semibold">Join link</h2>
            <JoinLink url={`${await requestOrigin()}${base}/interview`} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
