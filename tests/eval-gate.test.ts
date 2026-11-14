import { describe, expect, it } from "vitest";
import { gate } from "@/lib/eval-gate";

const file = (version: string, body = "Instructions.") => `---\nagent: interviewer\nversion: ${version}\n---\n${body}\n`;
const passing = { valid_for_gate: true, versions: { interviewer: "1.1.0" }, rubric: { passed: true }, themes: { passed: true } };

describe("the eval gate", () => {
  it("passes when no AGENT.md changed", () => {
    expect(gate([{ folder: "interviewer", current: file("1.0.0"), base: file("1.0.0") }], []).ok).toBe(true);
  });

  it("fails a changed AGENT.md with no report for its new version", () => {
    const r = gate([{ folder: "interviewer", current: file("1.1.0", "New"), base: file("1.0.0") }], []);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/no passing real-model report for that version/);
  });

  it("fails a change that kept the old version", () => {
    const r = gate([{ folder: "interviewer", current: file("1.0.0", "New"), base: file("1.0.0") }], [passing]);
    expect(r.problems[0]).toMatch(/Raise the version/);
  });

  it("doesn't accept a stub report, or one under the pass marks", () => {
    const change = [{ folder: "interviewer", current: file("1.1.0", "New"), base: file("1.0.0") }];
    expect(gate(change, [{ ...passing, valid_for_gate: false }]).ok).toBe(false);
    expect(gate(change, [{ ...passing, rubric: { passed: false } }]).ok).toBe(false);
    expect(gate(change, [passing]).ok).toBe(true);
  });

  it("treats a new AGENT.md as a change", () => {
    expect(gate([{ folder: "interviewer", current: file("1.1.0"), base: null }], []).ok).toBe(false);
  });
});
