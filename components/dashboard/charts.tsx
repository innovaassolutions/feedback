"use client";
import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui";

// Every chart takes its colors from the theme's chart variables, so it follows the organization's
// branding in light and dark mode. Every chart has a table view with the same numbers.

const C = (n: 1 | 2 | 3 | 4 | 5) => `var(--chart-${n})`;
const axis = { stroke: "var(--muted)", tick: { fill: "var(--muted)", fontSize: 12 } };
const tooltip = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: "var(--t-radius)" },
  labelStyle: { color: "var(--text)" },
  itemStyle: { color: "var(--text)" },
};

type Table = { columns: string[]; rows: Array<Array<string | number>> };

export function ChartCard({ id, title, table, children }: { id: string; title: string; table: Table; children: ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card data-testid={`chart-${id}`} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <button type="button" className="text-sm text-primary underline no-print" onClick={() => setShowTable((s) => !s)} aria-pressed={showTable}>
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {showTable ? (
        <table className="w-full text-sm" data-testid={`table-${id}`}>
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c} className="border-b border-border py-1 text-left font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} className="border-b border-border py-1">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="w-full" role="img" aria-label={`${title} chart. Use Show table for the numbers.`}>
          {children}
        </div>
      )}
    </Card>
  );
}

export function SpreadChart({ id, title, data, color = 1 }: { id: string; title: string; data: Array<{ label: string; count: number }>; color?: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <ChartCard id={id} title={title} table={{ columns: ["Answer", "Learners"], rows: data.map((d) => [d.label, d.count]) }}>
      <BarChart responsive style={{ width: "100%", height: 220 }} data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...axis} />
        <YAxis type="category" dataKey="label" width={170} {...axis} />
        <Tooltip {...tooltip} cursor={{ fill: "var(--primary-soft)" }} />
        <Bar dataKey="count" name="Learners" fill={C(color)} radius={3} isAnimationActive={false} />
      </BarChart>
    </ChartCard>
  );
}

export function ThemeChart({ data }: { data: Array<{ theme: string; positive: number; negative: number }> }) {
  return (
    <ChartCard
      id="themes"
      title="Mentions by theme"
      table={{ columns: ["Theme", "Positive", "Negative"], rows: data.map((d) => [d.theme, d.positive, d.negative]) }}
    >
      <BarChart responsive style={{ width: "100%", height: Math.max(180, data.length * 44 + 60) }} data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...axis} />
        <YAxis type="category" dataKey="theme" width={190} {...axis} />
        <Tooltip {...tooltip} cursor={{ fill: "var(--primary-soft)" }} />
        <Legend wrapperStyle={{ color: "var(--text)" }} />
        <Bar dataKey="positive" name="Positive" fill={C(1)} radius={3} isAnimationActive={false} />
        <Bar dataKey="negative" name="Negative" fill={C(4)} radius={3} isAnimationActive={false} />
      </BarChart>
    </ChartCard>
  );
}

export type TrendPoint = { session: string; responses: number; able_pct: number | null; pace_pct: number | null; recommend: number | null };

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const show = (v: number | null, suffix = "") => (v === null ? "Hidden" : `${v}${suffix}`);
  return (
    <ChartCard
      id="trend"
      title="Across sessions"
      table={{
        columns: ["Session", "Responses", "Able to apply", "Pace about right", "Recommend"],
        rows: data.map((d) => [d.session, d.responses, show(d.able_pct, "%"), show(d.pace_pct, "%"), show(d.recommend)]),
      }}
    >
      <LineChart responsive style={{ width: "100%", height: 240 }} data={data} margin={{ left: 0, right: 24 }}>
        <CartesianGrid stroke="var(--border)" />
        <XAxis dataKey="session" {...axis} />
        <YAxis yAxisId="pct" domain={[0, 100]} unit="%" {...axis} />
        <YAxis yAxisId="score" orientation="right" domain={[0, 10]} {...axis} />
        <Tooltip {...tooltip} />
        <Legend wrapperStyle={{ color: "var(--text)" }} />
        <Line yAxisId="pct" dataKey="able_pct" name="Able to apply %" stroke={C(1)} strokeWidth={2} connectNulls isAnimationActive={false} />
        <Line yAxisId="pct" dataKey="pace_pct" name="Pace about right %" stroke={C(2)} strokeWidth={2} connectNulls isAnimationActive={false} />
        <Line yAxisId="score" dataKey="recommend" name="Recommend (0–10)" stroke={C(3)} strokeWidth={2} connectNulls isAnimationActive={false} />
      </LineChart>
    </ChartCard>
  );
}

export function QuestionsChart({ data }: { data: Array<{ session: string; open: number; answered: number }> }) {
  return (
    <ChartCard id="questions" title="Questions: open and answered" table={{ columns: ["Session", "Open", "Answered"], rows: data.map((d) => [d.session, d.open, d.answered]) }}>
      <BarChart responsive style={{ width: "100%", height: 220 }} data={data} margin={{ left: 0, right: 16 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="session" {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tooltip} cursor={{ fill: "var(--primary-soft)" }} />
        <Legend wrapperStyle={{ color: "var(--text)" }} />
        <Bar dataKey="open" name="Open" fill={C(4)} stackId="q" isAnimationActive={false} />
        <Bar dataKey="answered" name="Answered" fill={C(1)} stackId="q" isAnimationActive={false} />
      </BarChart>
    </ChartCard>
  );
}
