import type { SessionResults } from "@/lib/server/ops/results";
import { formatMinutes, type Fraction, type QaStats } from "@/lib/metrics";

function Tile({ id, label, value, detail }: { id: string; label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-theme border border-border bg-surface p-4" data-testid={`tile-${id}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold" data-testid={`tile-${id}-value`}>{value}</p>
      {detail ? <p className="mt-1 text-sm text-muted">{detail}</p> : null}
    </div>
  );
}

const ofText = (f: Fraction) => `${f.count} of ${f.of}`;
const pct = (f: Fraction) => (f.pct === null ? undefined : `${f.pct}%`);

export function Tiles({ results }: { results: SessionResults }) {
  const t = results.tiles!;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="tiles">
      <Tile id="responses" label="Responses" value={ofText(t.responses)} detail={pct(t.responses)} />
      {t.applied ? (
        <Tile id="applied" label="Applied at work" value={ofText(t.applied)} detail={pct(t.applied)} />
      ) : (
        <>
          <Tile id="able" label="Able to apply" value={ofText(t.able)} detail={`${pct(t.able) ?? ""} chose either “Yes” answer`} />
          <Tile id="pace" label="Pace about right" value={ofText(t.pace)} detail={pct(t.pace)} />
        </>
      )}
      {t.recommend.average !== null ? (
        <Tile
          id="recommend"
          label="Recommend"
          value={String(t.recommend.average)}
          detail={`Range ${t.recommend.min}–${t.recommend.max} from ${t.recommend.answered} answers`}
        />
      ) : null}
      {t.nps !== null ? <Tile id="nps" label="Net Promoter Score" value={String(t.nps)} detail="Shown at ten or more answers" /> : null}
    </div>
  );
}

export function QaTile({ stats }: { stats: QaStats }) {
  return (
    <div className="rounded-theme border border-border bg-surface p-4" data-testid="tile-qa">
      <p className="text-sm text-muted">Q&amp;A</p>
      <p className="mt-1 text-3xl font-semibold" data-testid="tile-qa-value">{stats.answered} answered · {stats.open} open</p>
      <p className="mt-1 text-sm text-muted" data-testid="tile-qa-detail">
        Median time to an answer {formatMinutes(stats.median_minutes)} · {stats.sent_to_instructor} sent to the instructor
      </p>
    </div>
  );
}
