import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCourse } from "@/lib/course";
import { createUserClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/request";
import { SESSION_STATE_LABEL, describeSessionState, formatDate } from "@/lib/labels";
import { Badge, Card, PageTitle } from "@/components/ui";
import { StateButton } from "@/components/admin/state-button";
import { DocumentsPanel } from "@/components/admin/documents-panel";
import { BriefEditor } from "@/components/admin/brief-editor";
import { JoinLink } from "@/components/join-link";
import { DeleteButton, EditForm } from "@/components/admin/edit-forms";

type Brief = { objectives: string[]; topics: string[]; known_issues: string[] };

/**
 * The Librarian drafts the brief after a document is read, so the page keeps refreshing until the
 * draft is newer than the latest ready document. A draft that never comes stops the wait after
 * two minutes.
 */
function waitingForBrief(documents: Array<{ status: string; updated_at: string }>, briefDraftAt: string | null): boolean {
  const draftAt = briefDraftAt ? Date.parse(briefDraftAt) : 0;
  const now = Date.now();
  return documents.some((d) => d.status === "ready" && Date.parse(d.updated_at) > draftAt && now - Date.parse(d.updated_at) < 120_000);
}

export default async function AdminSessionPage({ params }: PageProps<"/[org]/[course]/admin/sessions/[n]">) {
  const { org, course, n } = await params;
  const ctx = await requireCourse(org, course);
  const db = await createUserClient();
  const { data: session } = await db
    .from("sessions")
    .select("id, number, title, date, state, objectives, brief, brief_draft, brief_draft_at, brief_approved_at, closes_at")
    .eq("course_id", ctx.course.id)
    .eq("number", Number(n))
    .maybeSingle();
  if (!session) notFound();
  const { data: documents } = await db
    .from("documents")
    .select("id, title, audience, status, error, file_name, size_bytes, updated_at")
    .eq("session_id", session.id)
    .order("created_at");
  const joinUrl = `${await requestOrigin()}/${org}/${course}/sessions/${session.number}/interview`;
  const brief = (session.brief_approved_at ? session.brief : session.brief_draft) as Brief | null;

  // The sessions either side, to move through the course's setup in order.
  const { data: siblings } = await db.from("sessions").select("number, title").eq("course_id", ctx.course.id).order("number");
  const at = (siblings ?? []).findIndex((x) => x.number === session.number);
  const previous = at > 0 ? siblings![at - 1] : null;
  const next = at >= 0 && at < (siblings ?? []).length - 1 ? siblings![at + 1] : null;
  const base = `/${org}/${course}/admin`;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted">
        <Link href={base}>All sessions</Link> <span aria-hidden="true">›</span> Session {session.number}
      </nav>
      <PageTitle
        title={`Session ${session.number}: ${session.title}`}
        subtitle={formatDate(session.date)}
        actions={
          <>
            <Badge tone={session.state === "open" ? "primary" : "neutral"}>{SESSION_STATE_LABEL[session.state]}</Badge>
            <StateButton sessionId={session.id} state={session.state} />
          </>
        }
      />
      <p className="-mt-3 mb-3 text-muted">{describeSessionState(session.state, session.closes_at)}</p>
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <EditForm
            toggle="Edit details"
            path={`/api/sessions/${session.id}`}
            redirect={`${base}/sessions/{number}`}
            testId="session-details"
            fields={[
              { name: "number", label: "Session number", type: "number", value: session.number, min: 1, max: 999, hint: "Its place in the course" },
              { name: "date", label: "Date", type: "date", value: session.date },
              { name: "title", label: "Title", value: session.title, wide: true },
              { name: "objectives", label: "Objectives", type: "textarea", value: session.objectives ?? "", hint: "What learners should be able to do afterwards" },
            ]}
          />
        </div>
        <DeleteButton path={`/api/sessions/${session.id}`} what={`Session ${session.number}`} label="Delete session" redirect={base} testId="delete-session" />
      </div>
      <div className="grid gap-6">
        <Card>
          <h2 className="mb-1 text-lg font-semibold">1. Documents</h2>
          <p className="mb-3 text-sm text-muted">
            The session&apos;s slides, handouts and notes, and the transcript of its recording. The Librarian reads them to draft the brief and to answer learners&apos; questions. Upload the transcript as Agents only.
          </p>
          <DocumentsPanel organizationId={ctx.course.organization_id} courseId={ctx.course.id} sessionId={session.id} documents={documents ?? []} waitingForBrief={waitingForBrief(documents ?? [], session.brief_draft_at)} />
        </Card>
        <Card>
          <h2 className="mb-1 text-lg font-semibold">2. Session brief</h2>
          <p className="mb-3 text-sm text-muted">What the session set out to teach. The feedback interview asks about it once you approve it.</p>
          <BriefEditor
            key={`${session.brief_draft_at}-${session.brief_approved_at}`}
            sessionId={session.id}
            initial={brief}
            approvedAt={session.brief_approved_at}
            draftAt={session.brief_draft_at}
          />
        </Card>
        <Card>
          <h2 className="mb-1 text-lg font-semibold">3. Feedback</h2>
          <p className="mb-3 text-sm text-muted">
            After the session, choose Open feedback at the top of this page, then share this link or put the QR code on the last slide. Learners also get a reminder by email.
          </p>
          <JoinLink url={joinUrl} />
          <p className="mt-3 text-sm">
            <Link href={`/${org}/${course}/sessions/${session.number}`}>See the session as learners do, with its Q&amp;A board</Link>
          </p>
        </Card>
      </div>
      <nav aria-label="Other sessions" className="mt-6 flex flex-wrap justify-between gap-3 text-sm">
        <span>{previous ? <Link href={`${base}/sessions/${previous.number}`}>← Session {previous.number}: {previous.title}</Link> : null}</span>
        <span>{next ? <Link href={`${base}/sessions/${next.number}`}>Session {next.number}: {next.title} →</Link> : <Link href={base}>Add another session</Link>}</span>
      </nav>
    </>
  );
}
