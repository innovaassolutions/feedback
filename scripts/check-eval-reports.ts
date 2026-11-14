// npm run evals:gate -- --base origin/main
// Fails if any agents/*/AGENT.md differs from the base branch without a passing eval report
// for its new version. CI runs it on every push and pull request.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gate, type GateAgent, type GateReport } from "@/lib/eval-gate";

const i = process.argv.indexOf("--base");
const base = i > 0 ? process.argv[i + 1] : process.env.EVAL_GATE_BASE ?? "origin/main";

function atBase(file: string): string | null {
  try {
    return execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

const agents: GateAgent[] = readdirSync("agents")
  .filter((d) => existsSync(path.join("agents", d, "AGENT.md")))
  .map((folder) => {
    const file = `agents/${folder}/AGENT.md`;
    return { folder, current: readFileSync(file, "utf8"), base: atBase(file) };
  });

const dir = path.join("evals", "reports");
const reports: GateReport[] = existsSync(dir)
  ? readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.endsWith(".transcripts.json"))
      .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")))
  : [];

const result = gate(agents, reports);
if (!result.checked.length) console.log(`No AGENT.md changed against ${base}.`);
else console.log(`Changed against ${base}: ${result.checked.join(", ")}`);
for (const p of result.problems) console.error(`✗ ${p}`);
if (result.ok) console.log("✓ Every changed AGENT.md has a passing eval report for its version.");
process.exit(result.ok ? 0 : 1);
