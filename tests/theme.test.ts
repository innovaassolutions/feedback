import { describe, expect, it } from "vitest";
import { failingPairs, themeCss } from "@/lib/theme/tokens";
import { NORTHWIND_THEME, STREAMSPACE_THEME } from "@/lib/server/seed";

describe("seeded themes", () => {
  it("pass the 4.5:1 contrast check in light and dark mode", () => {
    expect(failingPairs(STREAMSPACE_THEME)).toEqual([]);
    expect(failingPairs(NORTHWIND_THEME)).toEqual([]);
  });

  it("write light and dark CSS variables", () => {
    const css = themeCss(STREAMSPACE_THEME, "[data-org-theme]");
    expect(css).toContain("--primary:#1d5fd1");
    expect(css).toContain("prefers-color-scheme: dark");
  });
});
