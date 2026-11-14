import { parseAgentFile } from "@/lib/server/ai/agent-file";

// The merge gate for agent instructions: a changed AGENT.md must raise its version, and there
// must be a real-model eval report for the new version that meets both pass marks.

export type GateAgent = { folder: string; current: string; base: string | null };
export type GateReport = {
  valid_for_gate?: boolean;
  versions?: Record<string, string>;
  rubric?: { passed?: boolean };
  themes?: { passed?: boolean };
};

export function gate(agents: GateAgent[], reports: GateReport[]): { ok: boolean; problems: string[]; checked: string[] } {
  const problems: string[] = [];
  const checked: string[] = [];
  for (const a of agents) {
    if (a.base !== null && a.base === a.current) continue;
    const current = parseAgentFile(a.current);
    checked.push(`${a.folder} ${current.version}`);
    if (a.base !== null) {
      const before = parseAgentFile(a.base);
      if (before.version === current.version) {
        problems.push(`agents/${a.folder}/AGENT.md changed but its version is still ${current.version}. Raise the version.`);
        continue;
      }
    }
    const passing = reports.some(
      (r) => r.valid_for_gate === true && r.versions?.[a.folder] === current.version && r.rubric?.passed === true && r.themes?.passed === true,
    );
    if (!passing) {
      problems.push(`agents/${a.folder}/AGENT.md is at ${current.version} but evals/reports/ has no passing real-model report for that version. Run npm run evals and commit the report.`);
    }
  }
  return { ok: problems.length === 0, problems, checked };
}
