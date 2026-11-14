import { notFound } from "next/navigation";
import { requireCourse } from "@/lib/course";
import { createUserClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/request";
import { SESSION_STATE_LABEL, formatDate } from "@/lib/labels";
import { Badge, Card, PageTitle } from "@/components/ui";
import { StateButton } from "@/components/admin/state-button";
import { DocumentsPanel } from "@/components/admin/documents-panel";
import { BriefEditor } from "@/components/admin/brief-editor";
import { JoinLink } from "@/components/join-link";

type Brief = { objectives: string[]; topics: string[]; known_issues: string[] };

export default async function AdminSessionPage({ params }: PageProps<"/[org]/[course]/admin/sessions/[n]">) {
  const { org, course, n } = await params;
  const ctx = await requireCourse(org, course);
  const db = await createUserClient();
  const { data: session } = await db
    .from("sessions")
    .select("id, number, title, date, state, objectives, brief, brief_draft, brief_draft_at, brief_approved_at")
    .eq("course_id", ctx.course.id)
    .eq("number", Number(n))
    .maybeSingle();
  if (!session) notFound();
  const { data: documents } = await db
    .from("documents")
    .select("id, title, audience, status, error, file_name, size_bytes")
    .eq("session_id", session.id)
    .order("created_at");
  const joinUrl = `${await requestOrigin()}/${org}/${course}/sessions/${session.number}/interview`;
  const brief = (session.brief_approved_at ? session.brief : session.brief_draft) as Brief | null;

  return (
    <>
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
      <div className="grid gap-6">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Join link</h2>
          <JoinLink url={joinUrl} />
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Documents</h2>
          <DocumentsPanel sessionId={session.id} documents={documents ?? []} />
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Session brief</h2>
          <BriefEditor
            key={`${session.brief_draft_at}-${session.brief_approved_at}`}
            sessionId={session.id}
            initial={brief}
            approvedAt={session.brief_approved_at}
            draftAt={session.brief_draft_at}
          />
        </Card>
      </div>
    </>
  );
}
