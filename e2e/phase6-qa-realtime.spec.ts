import { expect, test } from "@playwright/test";
import { admin, signIn } from "./support";

// Runs after the other end-to-end tests, on its own (see playwright.config.ts), because it measures time.

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

test("a question and an answer posted in one browser appear in another within two seconds, without a reload", async ({ browser }) => {
  const s = await openSession("Realtime Q&A");
  const path = `/streamspace/ime-engineering/sessions/${s.number}`;
  const learner = await browser.newPage();
  await signIn(learner, "aisha", path);
  const watcher = await browser.newPage();
  await signIn(watcher, "ben", path);
  await expect(watcher.getByTestId("qa-board")).toHaveAttribute("data-live", "SUBSCRIBED");
  await expect(learner.getByTestId("qa-board")).toHaveAttribute("data-live", "SUBSCRIBED");
  // Warm up: the dev server compiles a route on its first request, which isn't what this measures.
  await learner.getByLabel("Ask a question about this session").fill("Warm-up question for the board?");
  await learner.getByRole("button", { name: "Post question" }).click();
  await expect(watcher.getByTestId("question-text").filter({ hasText: "Warm-up question" })).toBeVisible({ timeout: 15_000 });

  const text = `Does the Core Agent keep a history of runs? ${Date.now()}`;
  await learner.getByLabel("Ask a question about this session").fill(text);
  const posted = Date.now();
  await learner.getByRole("button", { name: "Post question" }).click();
  await expect(watcher.getByTestId("question-text").filter({ hasText: text })).toBeVisible({ timeout: 2000 });
  expect(Date.now() - posted).toBeLessThan(2500);

  // An instructor's answer shows up live too.
  const instructor = await browser.newPage();
  await signIn(instructor, "marcus", path);
  await expect(instructor.getByTestId("qa-board")).toHaveAttribute("data-live", "SUBSCRIBED");
  const card = instructor.getByTestId("question").filter({ hasText: text });
  await card.getByRole("button", { name: /^(Answer|Replace with my answer)$/ }).click();
  await card.getByLabel("Your answer").fill("Yes: open the agent and choose Runs.");
  const answered = Date.now();
  await card.getByRole("button", { name: "Save answer" }).click();
  const seen = watcher.getByTestId("question").filter({ hasText: text });
  await expect(seen.getByTestId("answer")).toContainText("open the agent and choose Runs", { timeout: 2000 });
  await expect(seen.getByTestId("question-state")).toHaveText("Answered by instructor");
  expect(Date.now() - answered).toBeLessThan(3000);
});
