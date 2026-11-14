import { describe, expect, it } from "vitest";
import { ableToApply, netPromoterScore, numbersIn, onlyAllowedNumbers, allowedNumbers, paceAboutRight, recommend, responseRate, spread, themeMentions, type RatingRow } from "@/lib/metrics";
import { DEMO_INTERVIEWS } from "@/lib/server/demo";
import { chooseSummary, templateSummary } from "@/agents/analyst/summary";

const demoRows: RatingRow[] = DEMO_INTERVIEWS.flatMap((d) => Object.entries(d.ratings).map(([item_id, choice]) => ({ item_id, choice })));
const recommendRows = (scores: Array<number | "prefer_not_to_say">) => scores.map((s) => ({ item_id: "recommend", choice: String(s) }));

describe("metrics", () => {
  it("response rate counts and rounds", () => {
    expect(responseRate(7, 8)).toEqual({ count: 7, of: 8, pct: 88 });
    expect(responseRate(0, 0)).toEqual({ count: 0, of: 0, pct: null });
  });

  it("Able to apply counts learners who chose either Yes answer", () => {
    expect(ableToApply(demoRows, 7)).toEqual({ count: 5, of: 7, pct: 71 });
    expect(ableToApply([{ item_id: "ability", choice: "only_with_help" }, { item_id: "ability", choice: "prefer_not_to_say" }], 2).count).toBe(0);
  });

  it("the pace spread counts each choice and Prefer not to say", () => {
    expect(spread(demoRows, "pace", ["too_slow", "about_right", "too_fast"])).toEqual([
      { choice: "too_slow", count: 1 },
      { choice: "about_right", count: 4 },
      { choice: "too_fast", count: 2 },
      { choice: "prefer_not_to_say", count: 0 },
    ]);
    expect(paceAboutRight(demoRows, 7)).toEqual({ count: 4, of: 7, pct: 57 });
  });

  it("the Recommend average is to one decimal, ignores Prefer not to say, and gives the range", () => {
    expect(recommend(demoRows)).toEqual({ average: 7.7, answered: 7, min: 6, max: 9 });
    expect(recommend(recommendRows([10, "prefer_not_to_say", 7]))).toEqual({ average: 8.5, answered: 2, min: 7, max: 10 });
    expect(recommend([]).average).toBeNull();
  });

  it("the Net Promoter Score appears only at ten or more answers", () => {
    expect(netPromoterScore(demoRows)).toBeNull();
    expect(netPromoterScore(recommendRows([10, 9, 9, 8, 7, 6, 5, 9, 10, "prefer_not_to_say"]))).toBeNull();
    // 10 answers: 5 promoters (9–10), 2 detractors (0–6) → 50% − 20% = 30
    expect(netPromoterScore(recommendRows([10, 9, 9, 8, 7, 6, 5, 9, 10, 8]))).toBe(30);
  });

  it("theme mentions count mixed on both sides", () => {
    expect(themeMentions([{ theme: "Pace and timing", sentiment: "negative" }, { theme: "Pace and timing", sentiment: "mixed" }, { theme: "Logistics", sentiment: "positive" }])).toEqual([
      { theme: "Pace and timing", positive: 1, negative: 2 },
      { theme: "Logistics", positive: 1, negative: 0 },
    ]);
  });

  it("finds numbers in digits and words", () => {
    expect(numbersIn("7 of 8 learners, seven said 7.7 and a third")).toEqual(["7", "8", "7.7", "7", "fraction"]);
    expect(onlyAllowedNumbers("7 of 8 responded", allowedNumbers([7, 8]))).toBe(true);
    expect(onlyAllowedNumbers("9 of 8 responded", allowedNumbers([7, 8]))).toBe(false);
  });

  it("a summary with a number that wasn't passed in is replaced by the template", () => {
    const numbers = { session_number: 1, responses: 7, enrolled: 8, able_to_apply: 5, able_to_apply_pct: 71, pace_about_right: 4, pace_about_right_pct: 57, recommend_average: 7.7, applied_at_work: null };
    expect(chooseSummary("7 of 8 responded and 5 could apply it.", numbers, [])).toEqual({ text: "7 of 8 responded and 5 could apply it.", source: "analyst" });
    const bad = chooseSummary("Most learners (90%) loved it.", numbers, ["Pace and timing"]);
    expect(bad.source).toBe("template");
    expect(bad.text).toBe(templateSummary(numbers, ["Pace and timing"]));
    expect(bad.text).toContain("7 of 8 learners responded.");
  });
});
