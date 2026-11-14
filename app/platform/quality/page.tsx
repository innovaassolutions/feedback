import { requestCtx } from "@/lib/server/route";
import { getQuality, type QualityRow } from "@/lib/server/ops/quality";
import { Card, PageTitle } from "@/components/ui";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 1000) / 10}%`);

const COLUMNS: Array<{ key: keyof QualityRow; label: string; format: (v: number | string | null) => string }> = [
  { key: "runs", label: "Runs", format: (v) => String(v) },
  { key: "validation_failure_rate", label: "Validation failures", format: (v) => pct(v as number | null) },
  { key: "rubric_pass_rate", label: "Rubric pass rate", format: (v) => pct(v as number | null) },
  { key: "read_backs_confirmed_without_edits", label: "Read-backs confirmed without edits", format: (v) => pct(v as number | null) },
  { key: "abandon_rate", label: "Abandon rate", format: (v) => pct(v as number | null) },
  { key: "median_turns", label: "Median turns", format: (v) => (v === null ? "—" : String(v)) },
  { key: "cost_per_interview_usd", label: "Cost per interview", format: (v) => (v === null ? "—" : `$${Number(v).toFixed(4)}`) },
  { key: "ai_answers_verified_without_edits", label: "AI answers verified without edits", format: (v) => pct(v as number | null) },
  { key: "questions_sources_could_not_answer", label: "Questions the sources couldn't answer", format: (v) => pct(v as number | null) },
];

export default async function QualityPage() {
  const q = await getQuality(await requestCtx());
  return (
    <>
      <PageTitle
        title="Agent quality"
        subtitle="By agent and AGENT.md version. The platform admin is emailed when the seven-day rubric pass rate falls under 85% or validation failures pass 5%."
      />
      <Card className="mb-6 overflow-x-auto">
        <table className="w-full text-sm" data-testid="quality-table">
          <thead>
            <tr>
              <th className="border-b border-border py-2 pr-3 text-left">Agent</th>
              <th className="border-b border-border py-2 pr-3 text-left">Version</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="border-b border-border py-2 pr-3 text-left font-medium">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.rows.map((r) => (
              <tr key={`${r.agent}-${r.version}`}>
                <td className="border-b border-border py-2 pr-3">{r.agent}</td>
                <td className="border-b border-border py-2 pr-3">{r.version}</td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="border-b border-border py-2 pr-3">{c.format(r[c.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Review queue</h2>
          <p data-testid="review-queue">{q.review_queue} interviews failed analysis twice and are waiting for their instructors to review them.</p>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Candidates for the labelled set</h2>
          <p className="mb-2 text-sm text-muted">Insights an instructor marked Not accurate. With the instructor&apos;s agreement, add the transcript and corrected labels to the Analyst&apos;s eval set.</p>
          <ul className="space-y-1 text-sm" data-testid="candidates">
            {q.candidates.map((c) => (
              <li key={c.insight_id}>{c.course}, Session {c.session} · Analyst {c.analyst_version} · marked {c.marked_on}</li>
            ))}
            {q.candidates.length ? null : <li className="text-muted">None yet.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
