import { notFound } from "next/navigation";
import { requireCourse } from "@/lib/course";
import { sessionDashboard } from "@/lib/server/dashboard";
import { logoUrl } from "@/lib/env";
import { formatDate } from "@/lib/labels";
import { Tiles } from "@/components/dashboard/tiles";
import { PrintButton } from "@/components/dashboard/print-button";

/** The session report for printing: no navigation, sized for A4. */
export default async function PrintReport({ params }: PageProps<"/[org]/[course]/dashboard/sessions/[n]/print">) {
  const { org, course, n } = await params;
  const ctx = await requireCourse(org, course);
  if (!ctx.can.readResults) notFound();
  const data = await sessionDashboard(ctx.course.id, Number(n));
  if (!data) notFound();
  const { session, results, actions } = data;
  const logo = logoUrl(ctx.org.logo_path);
  return (
    <article className="mx-auto max-w-[180mm] space-y-6 bg-surface p-8 text-text print:p-0" data-testid="print-report">
      <header className="flex items-start justify-between gap-6 border-b border-border pb-4">
        <div>
          <p className="text-sm text-muted">{ctx.course.title}</p>
          <h1 className="text-2xl font-semibold">Session {session.number}: {session.title}</h1>
          <p className="text-sm text-muted">{formatDate(session.date)} · Feedback report</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt={`${ctx.org.name} logo`} data-testid="report-logo" className="h-10 w-auto" /> : null}
      </header>
      <PrintButton />
      {results.hidden ? (
        <p>Results appear once {results.min_group_size} learners have responded. {results.responses} of {results.enrolled} have responded so far.</p>
      ) : (
        <>
          <section className="break-inside-avoid"><Tiles results={results} /></section>
          {results.summary ? (
            <section className="break-inside-avoid">
              <h2 className="mb-1 text-lg font-semibold">Summary</h2>
              <p>{results.summary.text}</p>
            </section>
          ) : null}
          <section className="break-inside-avoid">
            <h2 className="mb-1 text-lg font-semibold">Themes</h2>
            <table className="w-full text-sm">
              <thead><tr><th className="border-b border-border text-left">Theme</th><th className="border-b border-border text-left">Positive</th><th className="border-b border-border text-left">Negative</th></tr></thead>
              <tbody>
                {results.charts!.themes.map((t) => (
                  <tr key={t.theme}><td className="py-1">{t.theme}</td><td>{t.positive}</td><td>{t.negative}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="grid grid-cols-2 gap-6 break-inside-avoid">
            <div>
              <h2 className="mb-1 text-lg font-semibold">Ability</h2>
              <ul className="text-sm">{results.charts!.ability.map((a) => <li key={a.label}>{a.label}: {a.count}</li>)}</ul>
            </div>
            <div>
              <h2 className="mb-1 text-lg font-semibold">Pace</h2>
              <ul className="text-sm">{results.charts!.pace.map((a) => <li key={a.label}>{a.label}: {a.count}</li>)}</ul>
            </div>
          </section>
          {results.blockers?.length ? (
            <section className="break-inside-avoid">
              <h2 className="mb-1 text-lg font-semibold">Top blockers</h2>
              <ul className="list-disc pl-5 text-sm">{results.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </section>
          ) : null}
          {results.suggestions?.length ? (
            <section className="break-inside-avoid">
              <h2 className="mb-1 text-lg font-semibold">Suggestions</h2>
              <ul className="list-disc pl-5 text-sm">{results.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </section>
          ) : null}
        </>
      )}
      <section className="break-inside-avoid">
        <h2 className="mb-1 text-lg font-semibold">You said, we did</h2>
        {actions.length ? (
          <ul className="space-y-1 text-sm">{actions.map((a) => <li key={a.id}><b>You said:</b> {a.you_said} <b>We did:</b> {a.we_did}</li>)}</ul>
        ) : (
          <p className="text-sm text-muted">Nothing recorded yet.</p>
        )}
      </section>
    </article>
  );
}
