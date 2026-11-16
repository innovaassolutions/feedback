import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { admin, signIn } from "./support";

async function openSession(title: string): Promise<{ id: string; number: number }> {
  const db = admin();
  const { data: course } = await db.from("courses").select("id, organization_id").eq("slug", "ime-engineering").single();
  const number = 40000 + Math.floor(Math.random() * 9000);
  const { data, error } = await db
    .from("sessions")
    .insert({ organization_id: course!.organization_id, course_id: course!.id, number, title, date: "2026-12-04", state: "open", opened_at: new Date().toISOString() })
    .select("id, number")
    .single();
  if (error) throw error;
  return data!;
}

test("an AI answer shows its label and its sources, marked by kind, and verifying relabels it", async ({ page, browser }) => {
  const s = await openSession("AI answer label");
  const instructor = await browser.newPage();
  await signIn(instructor, "marcus", `/streamspace/ime-engineering/admin/sessions/${s.number}`);
  await instructor.getByLabel("File").setInputFiles({ name: "rebuild-guide.md", mimeType: "text/markdown", buffer: readFileSync("tests/support/rebuild-guide.md") });
  await instructor.getByLabel("Title").fill("Rebuild guide");
  await instructor.getByRole("button", { name: "Upload document" }).click();
  await expect(instructor.getByTestId("document-list")).toContainText("Ready", { timeout: 30_000 });

  await signIn(page, "chloe", `/streamspace/ime-engineering/sessions/${s.number}`);
  await expect(page.getByTestId("qa-board")).toHaveAttribute("data-live", "SUBSCRIBED");
  await page.getByLabel("Ask a question about this session").fill("How do I find my project ID?");
  await page.getByRole("button", { name: "Post question" }).click();
  const q = page.getByTestId("question").filter({ hasText: "How do I find my project ID?" });
  await expect(q.getByTestId("question-state")).toHaveText("AI answer · not reviewed", { timeout: 20_000 });
  await expect(q.getByTestId("answer")).toContainText("address bar");
  const citation = q.getByTestId("citations").getByRole("listitem").first();
  await expect(citation).toContainText("Session document");
  await expect(citation.getByTestId("citation-link")).toHaveAttribute("href", /\/api\/documents\/.+\/download/);

  await instructor.goto(`/streamspace/ime-engineering/sessions/${s.number}`);
  const iq = instructor.getByTestId("question").filter({ hasText: "How do I find my project ID?" });
  await iq.getByRole("button", { name: "Verify" }).click();
  await expect(q.getByTestId("question-state")).toHaveText("Answered by instructor", { timeout: 5000 });
});
