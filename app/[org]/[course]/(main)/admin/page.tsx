import Link from "next/link";
import { requireCourse } from "@/lib/course";
import { createUserClient } from "@/lib/supabase/server";
import { SESSION_STATE_LABEL, describeSessionState, formatDate } from "@/lib/labels";
import { Badge, Card } from "@/components/ui";
import { NewSessionForm } from "@/components/admin/new-session-form";
import { StateButton } from "@/components/admin/state-button";
import { DocumentationForm } from "@/components/admin/documentation-form";

type Step = { done: boolean; text: string };

function StepLine({ steps }: { steps: Step[] }) {
  return (
    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Setup">
      {steps.map((s) => (
        <li key={s.text} className={s.done ? "text-success" : "text-muted"}>
          <span aria-hidden="true">{s.done ? "✓ " : "○ "}</span>
          {s.text}
        </li>
      ))}
    </ul>
  );
}

/** Course setup: the course is a series of sessions, each set up in turn, plus what applies to all of them. */
export default async function CourseSetupPage({ params }: PageProps<"/[org]/[course]/admin">) {
  const { org, course } = await params;
  const ctx = await requireCourse(org, course);
  const db = await createUserClient();
  const orgAdmin = ctx.roles.has("org_admin") || ctx.roles.has("platform_admin");
  const [{ data: sessions }, { data: documents }, { count: learners }, { data: staff }, { data: sources }] = await Promise.all([
    db.from("sessions").select("id, number, title, date, state, brief_approved_at, brief_draft_at, closes_at").eq("course_id", ctx.course.id).order("number"),
    db.from("documents").select("session_id, status").eq("course_id", ctx.course.id),
    db.from("enrollments").select("id", { count: "exact", head: true }).eq("course_id", ctx.course.id),
    db.from("memberships").select("role").eq("course_id", ctx.course.id),
    orgAdmin
      ? db.from("documentation_sources").select("id, url, status, page_count, error, last_read_at").eq("organization_id", ctx.org.id).order("created_at")
      : Promise.resolve({ data: null }),
  ]);
  const list = sessions ?? [];
  const docs = documents ?? [];
  const instructors = (staff ?? []).filter((m) => m.role === "instructor").length;
  const sponsors = (staff ?? []).filter((m) => m.role === "sponsor").length;
  const pages = (sources ?? []).reduce((n, s) => n + (s.page_count ?? 0), 0);
  const base = `/${org}/${course}/admin`;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  return (
    <>
      <p className="mb-6 max-w-3xl text-muted">
        <span className="font-medium text-text">{plural(list.length, "session")} · {plural(learners ?? 0, "learner")}.</span> A course is a series of sessions. Set up each session with its documents and brief, then open its feedback once it has been delivered. Learners, instructors and the interview guide apply to the whole course.
      </p>

      <Card className="mb-6">
        <h1 className="mb-1 text-lg font-semibold">Sessions</h1>
        <p className="mb-3 text-sm text-muted">One for each class, workshop or module, in order. Open a session to upload its documents and approve its brief.</p>
        <ol className="divide-y divide-border" data-testid="admin-sessions">
          {list.map((s) => {
            const mine = docs.filter((d) => d.session_id === s.id);
            const ready = mine.filter((d) => d.status === "ready").length;
            const reading = mine.filter((d) => d.status === "processing").length;
            const steps: Step[] = [
              {
                done: ready > 0,
                text: ready ? plural(ready, "document") + (reading ? `, ${reading} being read` : "") : reading ? `${plural(reading, "document")} being read` : "No documents yet",
              },
              {
                done: Boolean(s.brief_approved_at),
                text: s.brief_approved_at ? "Brief approved" : s.brief_draft_at ? "Brief drafted: review and approve it" : "Brief: needs documents",
              },
              { done: s.state === "open" || s.state === "closed", text: describeSessionState(s.state, s.closes_at) },
            ];
            return (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0">
                  <Link href={`${base}/sessions/${s.number}`} className="font-medium">
                    Session {s.number}: {s.title}
                  </Link>
                  <p className="text-sm text-muted">{formatDate(s.date)}</p>
                  <StepLine steps={steps} />
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={s.state === "open" ? "primary" : "neutral"}>{SESSION_STATE_LABEL[s.state]}</Badge>
                  <StateButton sessionId={s.id} state={s.state} />
                </div>
              </li>
            );
          })}
          {list.length === 0 ? <li className="py-4 text-muted">No sessions yet. Add the course&apos;s first session below.</li> : null}
        </ol>
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-1 font-semibold">Add session {list.length + 1}</h3>
          <p className="mb-3 text-sm text-muted">It starts as a draft that only instructors can see. Choose Show to learners when it&apos;s ready.</p>
          <NewSessionForm courseId={ctx.course.id} />
        </div>
      </Card>

      <h2 className="mb-3 text-lg font-semibold">For the whole course</h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="course-wide">
        <Card>
          <h3 className="font-semibold">Learners</h3>
          <p className="mb-2 text-sm text-muted">{learners ? `${plural(learners, "learner")} enrolled.` : "No learners yet."} Each is emailed an invitation.</p>
          <Link href={`${base}/roster`}>Invite learners</Link>
        </Card>
        <Card>
          <h3 className="font-semibold">Instructors and sponsors</h3>
          <p className="mb-2 text-sm text-muted">
            {plural(instructors, "instructor")} and {plural(sponsors, "sponsor")}. Sponsors view the results, such as managers and executives.
          </p>
          {orgAdmin ? <Link href={`/${org}/settings/people`}>Manage people</Link> : <span className="text-sm text-muted">An organization admin adds them.</span>}
        </Card>
        <Card>
          <h3 className="font-semibold">Interview guide</h3>
          <p className="mb-2 text-sm text-muted">
            <span className="text-success">✓ Ready to use.</span> Every feedback interview asks the standard rating questions and topics. Nothing to do unless this course needs different ones.
          </p>
          <Link href={`${base}/guide`}>See the questions</Link>
        </Card>
      </div>

      {orgAdmin ? (
        <Card id="documentation">
          <h2 className="mb-1 text-lg font-semibold">Product documentation <span className="text-sm font-normal text-muted">(optional)</span></h2>
          <p className="mb-3 text-sm text-muted">
            If the course teaches a product with public help pages, add their address. The Librarian then answers learners&apos; questions from the product&apos;s own instructions as well as each session&apos;s documents, and points out where they differ. It serves every course in {ctx.org.name}.
            {pages ? ` ${plural(pages, "page")} read so far.` : ""}
          </p>
          <DocumentationForm organizationId={ctx.org.id} sources={sources ?? []} />
        </Card>
      ) : null}
    </>
  );
}
