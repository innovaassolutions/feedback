import { describe, expect, it } from "vitest";
import { embeddedMarkdown, pagesFromScript, scriptUrls } from "@/agents/librarian/embedded-docs";
import { tidyBrief } from "@/agents/librarian/schema";
import { errorName } from "@/lib/server/ai/runs";

// A JavaScript documentation app's script, as a Vite build writes Markdown loaded with
// import.meta.glob: each file's text in a variable, then a map from path to variable.
export const APP_SCRIPT = [
  "const BRAND_NAME=\"Acme\",x=1;",
  "var g0=`---\\ntitle: Getting started\\n---\\n# Getting started\\n\\nWelcome to {{BRAND_NAME}}. Open **Flows** and choose \\`New flow\\` to begin building your first one.\\n\\n--8<-- \"_snippets/tip.md\"\\n`,",
  "g1=`Tip: save often, the editor keeps ::brand:: drafts for 30 days.`,",
  "g2=`---\\ntitle: Retries\\n---\\nA failed step is retried three times. Change it under Settings, then Reliability, from 0 to 5.`;",
  "const modules=Object.assign({\"/content/docs/index.md\":g0,\"/content/_snippets/tip.md\":g1,\"/content/docs/flows/retries.md\":g2});",
].join("\n");

describe("documentation carried inside a JavaScript app", () => {
  it("finds the app's scripts on its page", () => {
    const html = '<html><head><script type="module" crossorigin src="/assets/index-1.js"></script><script src="https://cdn.other.example/x.js"></script></head><body><div id=root></div></body></html>';
    expect(scriptUrls(html, "https://docs.acme.example/docs")).toEqual(["https://docs.acme.example/assets/index-1.js"]);
  });

  it("reads each Markdown file, fills in fragments and the brand, and maps it to its page address", () => {
    const files = embeddedMarkdown(APP_SCRIPT);
    expect([...files.keys()].sort()).toEqual(["/content/_snippets/tip.md", "/content/docs/flows/retries.md", "/content/docs/index.md"]);
    const pages = pagesFromScript(APP_SCRIPT, () => true, "https://docs.acme.example");
    expect(pages.map((p) => p.url).sort()).toEqual(["https://docs.acme.example/docs", "https://docs.acme.example/docs/flows/retries"]);
    const home = pages.find((p) => p.url.endsWith("/docs"))!;
    expect(home.title).toBe("Getting started");
    expect(home.text).toContain("Welcome to Acme. Open **Flows** and choose `New flow`");
    expect(home.text).toContain("the editor keeps Acme drafts for 30 days");
    expect(home.text).not.toContain("--8<--");
    expect(home.text.match(/# Getting started/g)).toHaveLength(1);
    // Only pages in scope are kept.
    expect(pagesFromScript(APP_SCRIPT, (u) => u.pathname.startsWith("/docs/flows"), "https://docs.acme.example").map((p) => p.title)).toEqual(["Retries"]);
  });

  it("finds nothing in an ordinary script", () => {
    expect(pagesFromScript("console.log('hello');", () => true, "https://x.example")).toEqual([]);
  });
});

describe("a drafted brief", () => {
  it("is fitted to the brief's limits instead of failing", () => {
    const brief = tidyBrief({
      objectives: ["  Build the invoice flow ", "Build the invoice flow", "x".repeat(400)],
      topics: Array.from({ length: 15 }, (_, i) => `Topic ${i + 1}`),
      known_issues: ["- Login failed for some learners", ""],
    })!;
    expect(brief.objectives).toHaveLength(2);
    expect(brief.objectives[1].length).toBeLessThanOrEqual(300);
    expect(brief.topics).toHaveLength(12);
    expect(brief.known_issues).toEqual(["Login failed for some learners"]);
    expect(tidyBrief({ objectives: [], topics: ["A topic"], known_issues: [] })).toBeNull();
  });

  it("records which rule an output broke, never its text", () => {
    const err = Object.assign(new Error("No object generated"), {
      name: "AI_NoObjectGeneratedError",
      cause: { name: "AI_TypeValidationError", cause: { issues: [{ path: ["topics"], code: "too_big", message: "secret text" }] } },
    });
    expect(errorName(err)).toBe("AI_NoObjectGeneratedError: topics too_big");
    expect(errorName(new Error("plain"))).toBe("Error");
  });
});
