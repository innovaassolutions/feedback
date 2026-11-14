import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCourse } from "@/lib/course";
import { sessionDashboard } from "@/lib/server/dashboard";
import { Card, LinkButton, Notice, PageTitle } from "@/components/ui";
import { QaTile, Tiles } from "@/components/dashboard/tiles";
import { QuestionsChart, SpreadChart, ThemeChart, TrendChart } from "@/components/dashboard/charts";
import { ActionForm } from "@/components/dashboard/action-form";

const STATUS = { planned: "Planned", in_progress: "In progress", done: "Done" } as const;

export default async function SessionResultsPage({ params }: PageProps<"/[org]/[course]/dashboard/sessions/[n]">) {
  const { org, course, n } = await params;
  const ctx = await requireCourse(org, course);
  if (!ctx.can.readResults) notFound();
  const data = await sessionDashboard(ctx.course.id, Number(n));
  if (!data) notFound();
  const { session, results, trend, qa, actions } = data;
  const base = `/${org}/${course}/dashboard/sessions/${session.number}`;

  return (
    <>
      <PageTitle
        title={`Session ${session.number}: ${session.title}`}
        subtitle="Results"
        actions={
          <>
            {ctx.can.readTranscripts ? <LinkButton variant="secondary" href={`${base}/transcripts`}>Transcripts</LinkButton> : null}
            <LinkButton variant="secondary" href={`${base}/print`}>Print report</LinkButton>
          </>
        }
      />
      {results.hidden ? (
        <Card data-testid="results-hidden">
          <p className="text-lg">Results appear once {results.min_group_size} learners have responded.</p>
          <p className="mt-1 text-muted">{results.responses} of {results.enrolled} have responded so far. Small groups are protected, so nothing else is shown yet.</p>
        </Card>
      ) : (
        <div className="grid gap-6">
          <Tiles results={results} />
          {results.summary ? (
            <Card data-testid="session-summary">
              <h2 className="mb-2 text-lg font-semibold">Summary</h2>
              <p>{results.summary.text}</p>
              {results.summary.source === "template" ? <p className="mt-2 text-xs text-muted">Written from the numbers, because the drafted summary didn&apos;t check out.</p> : null}
            </Card>
          ) : null}
          <div className="grid gap-6 lg:grid-cols-2">
            <SpreadChart id="ability" title="Could you now do it on your own?" data={results.charts!.ability} color={1} />
            <SpreadChart id="pace" title="Pace" data={results.charts!.pace} color={2} />
          </div>
          <ThemeChart data={results.charts!.themes} />
          <TrendChart data={trend} />
          {ctx.can.readTranscripts ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <h2 className="mb-2 text-lg font-semibold">Top blockers</h2>
                {results.blockers?.length ? <ul className="list-disc space-y-1 pl-5">{results.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul> : <p className="text-muted">None reported.</p>}
              </Card>
              <Card>
                <h2 className="mb-2 text-lg font-semibold">Suggestions</h2>
                {results.suggestions?.length ? <ul className="list-disc space-y-1 pl-5">{results.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="text-muted">None yet.</p>}
              </Card>
            </div>
          ) : null}
          {results.quotes ? (
            <Card data-testid="quotes">
              <h2 className="mb-2 text-lg font-semibold">In their words</h2>
              <ul className="space-y-3">
                {results.quotes.map((q, i) => (
                  <li key={i}>
                    <blockquote className="border-l-4 border-primary pl-3">“{q.text}”</blockquote>
                    <p className="mt-1 text-xs text-muted">{q.theme}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {qa.stats ? <QaTile stats={qa.stats} /> : null}
        {qa.chart.length ? <QuestionsChart data={qa.chart} /> : null}
      </div>
      <Card className="mt-6" data-testid="actions">
        <h2 className="mb-2 text-lg font-semibold">You said, we did</h2>
        <p className="mb-3 text-sm text-muted">Learners see these on the next session&apos;s page, and the Interviewer asks whether they helped.</p>
        {actions.length ? (
          <ul className="mb-4 space-y-2">
            {actions.map((a) => (
              <li key={a.id} className="rounded-theme border border-border p-3">
                <p><span className="font-medium">You said:</span> {a.you_said}</p>
                <p><span className="font-medium">We did:</span> {a.we_did}</p>
                <p className="text-xs text-muted">{STATUS[a.status as keyof typeof STATUS]}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-muted">Nothing recorded yet.</p>
        )}
        {ctx.can.instruct ? <ActionForm sessionId={session.id} /> : null}
      </Card>
      {!ctx.can.readTranscripts ? (
        <div className="mt-6">
          <Notice>Transcripts and quotes are for instructors only.</Notice>
        </div>
      ) : null}
      <p className="mt-6 text-sm"><Link href={`/${org}/${course}/dashboard`}>All sessions</Link></p>
    </>
  );
}
