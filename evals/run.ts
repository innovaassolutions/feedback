// npm run evals             both eval sets against the real model, report in evals/reports/
// npm run evals -- --stub   a dry run against the stub model (not valid for the merge gate)
//
// Set 1: eight scripted learner personas hold an interview with the real Interviewer; each is
//        scored against the rubric (limits and coverage in code, the rest by a judge model).
// Set 2: twelve hand-labelled transcripts check the Analyst's themes against a person's labels.
// Set 3: eight questions on one session check the Librarian's answers from fixture sources: what
//        the session covered, how-to steps from the product documentation, a disagreement between
//        the two, a question the sources can't answer, and not naming a learner (evals/librarian.ts).
// Pass marks: 90% of rubric items across the personas, 85% agreement on themes, 85% of Librarian cases.
//
// npm run evals -- --librarian   Set 3 only, while working on the Librarian (not valid for the merge gate)

import "../scripts/load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateText } from "ai";
import { aiProvider, modelIdFor } from "@/lib/server/ai/provider";
import { languageModel } from "@/lib/server/ai/models";
import { loadAgentFile, type AgentFolder } from "@/lib/server/ai/agent-file";
import { DEFAULT_SESSION_GUIDE } from "@/lib/guide";
import { SESSION_1_BRIEF } from "@/lib/server/seed";
import { handleLearnerTurn, hardLimit, initialProgress, openingMessage, type EngineSetup, type EngineState } from "@/agents/interviewer/engine";
import { PERSONAS, type Persona } from "@/agents/interviewer/evals/personas";
import { LABELLED } from "@/agents/analyst/evals/labelled";
import { THEMES } from "@/agents/analyst/schema";
import { analyseTranscript } from "@/agents/analyst/analyse";
import { codeChecks, judgeTranscript, readBackTurn, RUBRIC_ITEMS, JUDGE_VERSION, type RubricResult, type TranscriptTurn } from "@/lib/server/quality/rubric";
import { PASS_LIBRARIAN, runLibrarianSet } from "./librarian";

export const PASS_RUBRIC = 0.9;
export const PASS_THEMES = 0.85;

const stub = process.argv.includes("--stub");
if (aiProvider() === "stub" && !stub) {
  console.error("npm run evals needs a model: set AI_GATEWAY_API_KEY in .env.local. For a dry run against the stub, use `npm run evals -- --stub`.");
  process.exit(2);
}
if (stub) process.env.AI_PROVIDER = "stub";

const setup: EngineSetup = {
  kind: "session",
  guide: DEFAULT_SESSION_GUIDE,
  brief: SESSION_1_BRIEF,
  actions: [{ you_said: "The first session felt rushed", we_did: "We cut the introduction and added ten minutes of practice" }],
  courseTitle: "Streamspace platform training: IME Engineering",
  sessionTitle: "Session 2: Agents and automations",
  learnerName: null,
  limits: { maxTurns: 14, maxMinutes: 15 },
};

async function learnerSays(persona: Persona, transcript: TranscriptTurn[], index: number): Promise<string> {
  if (stub) return persona.lines[Math.min(index, persona.lines.length - 1)];
  const result = await generateText({
    model: languageModel("judge"),
    instructions: `You are role-playing a learner in a feedback interview after a training session on the Streamspace workflow platform. Stay in character.\n\nPersona: ${persona.description}\n\nReply with only the learner's next message, as they would type it. When rating choices are offered, answer in your own words rather than picking a label exactly.`,
    prompt: transcript.map((t) => `${t.role === "learner" ? "You" : "Interviewer"}: ${t.text}`).join("\n") + "\nYou:",
    maxOutputTokens: 200,
  });
  return result.text.trim().replace(/^You:\s*/, "") || "Okay.";
}

async function runPersona(persona: Persona) {
  const agent = loadAgentFile("interviewer");
  const deps = { model: languageModel("interviewer"), instructions: agent.instructions };
  const opening = openingMessage(setup.sessionTitle, "anonymous", "session");
  let state: EngineState = {
    stage: "consent",
    progress: initialProgress(setup),
    turnCount: 0,
    startedAt: new Date(),
    ratings: {},
    history: [{ role: "interviewer", text: opening, stage: "consent" }],
  };
  const transcript: TranscriptTurn[] = [{ role: "interviewer", text: opening, stage: "consent" }];
  let index = 0;
  // How long the learner waits for each reply: the Interviewer's whole turn, model calls included.
  const latencies: number[] = [];
  while (state.stage !== "read_back" && state.turnCount < hardLimit(setup)) {
    const said = await learnerSays(persona, transcript, index++);
    const turnCount = state.turnCount + 1;
    const started = performance.now();
    const result = await handleLearnerTurn(deps, setup, { ...state, turnCount }, said, "text", new Date());
    latencies.push(performance.now() - started);
    transcript.push({ role: "learner", text: said, stage: state.stage }, { role: "interviewer", text: result.reply, stage: result.stage });
    state = {
      ...state,
      stage: result.stage,
      progress: result.progress,
      turnCount,
      ratings: { ...state.ratings, ...Object.fromEntries(result.ratingsToSave.map((r) => [r.item_id, r.choice])) },
      history: [...state.history, { role: "learner", text: said, stage: state.stage }, { role: "interviewer", text: result.reply, stage: result.stage }],
    };
  }
  const code = codeChecks({ progress: state.progress, turnCount: state.turnCount, maxTurns: setup.limits.maxTurns, reachedReadBackAt: readBackTurn(transcript) });
  const judged = await judgeTranscript(languageModel("judge"), transcript, state.progress.proposed_summary);
  const results: RubricResult[] = [...code, ...judged.results];
  if (judged.error) results.push({ item: "read_back_matches", passed: false, method: "judge", note: `Judge failed: ${judged.error}` });
  return { persona: persona.id, turns: state.turnCount, reached_read_back: state.stage === "read_back", results, transcript, latencies };
}

async function runLabelled() {
  const agent = loadAgentFile("analyst");
  const deps = { model: languageModel("analyst"), instructions: agent.instructions };
  const rows = [];
  let decisions = 0;
  let agreed = 0;
  for (const item of LABELLED) {
    const learnerTurns = item.turns.filter((t) => t.role === "learner").map((t) => t.text);
    const context = {
      task: "analyse_interview",
      kind: "session",
      confirmed_summary: item.summary,
      learner_turns: learnerTurns,
      transcript: item.turns.map((t) => ({ speaker: t.role === "learner" ? "Learner" : "Interviewer", text: t.text })),
    };
    const { insight } = await analyseTranscript(deps, context, learnerTurns, false);
    const predicted = new Set(insight?.themes.map((t) => t.theme) ?? []);
    const labelled = new Set(Object.keys(item.labels));
    const perTheme = THEMES.map((theme) => {
      const match = predicted.has(theme) === labelled.has(theme);
      decisions++;
      if (match) agreed++;
      return { theme, labelled: labelled.has(theme), predicted: predicted.has(theme), match };
    });
    rows.push({ id: item.id, valid: Boolean(insight), mismatches: perTheme.filter((p) => !p.match) });
  }
  return { agreement: decisions ? agreed / decisions : 0, decisions, agreed, transcripts: rows };
}

const versions = Object.fromEntries(
  (["interviewer", "analyst", "librarian", "brand-designer"] as AgentFolder[]).flatMap((a) => {
    try {
      return [[a, loadAgentFile(a).version]];
    } catch {
      return [];
    }
  }),
);

const dir = path.join(process.cwd(), "evals", "reports");
mkdirSync(dir, { recursive: true });

if (process.argv.includes("--librarian")) {
  console.log(`Running the Librarian set (${stub ? "stub dry run" : "real model"})…`);
  const librarian = await runLibrarianSet(console.log);
  const created = new Date().toISOString();
  const only = { created_at: created, provider: stub ? "stub" : "gateway", valid_for_gate: false, models: { librarian: modelIdFor("librarian") }, versions, librarian };
  const file = `${created.replace(/[:.]/g, "-")}-${stub ? "stub" : "model"}-librarian-${versions.librarian}-only.json`;
  writeFileSync(path.join(dir, file), JSON.stringify(only, null, 2));
  console.log(`\nLibrarian ${(librarian.pass_rate * 100).toFixed(1)}% (pass mark ${PASS_LIBRARIAN * 100}%)\nReport: evals/reports/${file}`);
  process.exit(stub || librarian.passed ? 0 : 1);
}

console.log(`Running evals (${stub ? "stub dry run" : "real model"})…`);
const personas = [];
for (const p of PERSONAS) {
  const r = await runPersona(p);
  const passed = r.results.filter((x) => x.passed).length;
  console.log(`  persona ${p.id}: ${passed}/${r.results.length} rubric items, ${r.turns} turns${r.reached_read_back ? "" : ", never reached the read-back"}`);
  personas.push(r);
}
const all = personas.flatMap((p) => p.results);
const rubricRate = all.length ? all.filter((r) => r.passed).length / all.length : 0;
const waits = personas.flatMap((p) => p.latencies).sort((a, b) => a - b);
const pct = (q: number) => (waits.length ? Math.round(waits[Math.min(waits.length - 1, Math.floor(q * waits.length))]) : 0);
const latency = { turns: waits.length, median_ms: pct(0.5), p90_ms: pct(0.9), max_ms: pct(1) };
console.log(`  Interviewer reply time: median ${(latency.median_ms / 1000).toFixed(1)} s, 90th percentile ${(latency.p90_ms / 1000).toFixed(1)} s over ${latency.turns} turns`);
const themes = await runLabelled();
console.log(`  themes: ${(themes.agreement * 100).toFixed(1)}% agreement over ${themes.decisions} decisions`);
const librarian = await runLibrarianSet(console.log);

const report = {
  created_at: new Date().toISOString(),
  provider: stub ? "stub" : "gateway",
  valid_for_gate: !stub,
  models: { interviewer: modelIdFor("interviewer"), analyst: modelIdFor("analyst"), librarian: modelIdFor("librarian"), judge: modelIdFor("judge") },
  interviewer_latency: latency,
  versions,
  judge_version: JUDGE_VERSION,
  rubric: {
    rate: rubricRate,
    pass_mark: PASS_RUBRIC,
    passed: rubricRate >= PASS_RUBRIC,
    by_item: RUBRIC_ITEMS.map((item) => {
      const rs = all.filter((r) => r.item === item.id);
      return { item: item.id, passed: rs.filter((r) => r.passed).length, scored: rs.length };
    }),
    personas: personas.map((p) => ({ persona: p.persona, turns: p.turns, results: p.results })),
  },
  themes: { ...themes, pass_mark: PASS_THEMES, passed: themes.agreement >= PASS_THEMES },
  librarian,
};
const name = `${report.created_at.replace(/[:.]/g, "-")}-${stub ? "stub" : "model"}-interviewer-${versions.interviewer}-analyst-${versions.analyst}`;
writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(report, null, 2));
// The transcripts are synthetic, from scripted personas, so they can be kept with the report.
writeFileSync(path.join(dir, `${name}.transcripts.json`), JSON.stringify(personas.map((p) => ({ persona: p.persona, transcript: p.transcript })), null, 2));
console.log(`\nRubric ${(rubricRate * 100).toFixed(1)}% (pass mark ${PASS_RUBRIC * 100}%) · Themes ${(themes.agreement * 100).toFixed(1)}% (pass mark ${PASS_THEMES * 100}%) · Librarian ${(librarian.pass_rate * 100).toFixed(1)}% (pass mark ${PASS_LIBRARIAN * 100}%)`);
console.log(`Report: evals/reports/${name}.json`);
process.exit(stub || (report.rubric.passed && report.themes.passed && report.librarian.passed) ? 0 : 1);
