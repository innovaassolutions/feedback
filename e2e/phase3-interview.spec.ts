import { expect, test } from "@playwright/test";
import { admin, signIn } from "./support";

/** Opens a session of its own so this test can submit without affecting others. */
async function openSession(title: string): Promise<number> {
  const db = admin();
  const { data: course } = await db.from("courses").select("id, organization_id").eq("slug", "ime-engineering").single();
  const { data: last } = await db.from("sessions").select("number").eq("course_id", course!.id).order("number", { ascending: false }).limit(1).single();
  const number = (last?.number ?? 0) + 1 + Math.floor(Math.random() * 1000);
  const { error } = await db.from("sessions").insert({
    organization_id: course!.organization_id,
    course_id: course!.id,
    number,
    title,
    date: "2026-12-04",
    state: "open",
    opened_at: new Date().toISOString(),
    closes_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  if (error) throw error;
  return number;
}

test("chips, a stage marker, and a summary screen to edit points and change anonymity before submitting", async ({ page }) => {
  const n = await openSession("Browser interview");
  await signIn(page, "grace", `/streamspace/ime-engineering/sessions/${n}/interview`);

  await expect(page.getByTestId("consent")).toContainText("the way you write can still identify you");
  await expect(page.getByLabel("Anonymous")).toBeChecked();
  await page.getByRole("button", { name: "Start the interview" }).click();

  const marker = page.getByTestId("stage-marker");
  await expect(marker.locator("[aria-current=step]")).toHaveText("Consent");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(marker.locator("[aria-current=step]")).toHaveText("Ratings");

  await page.getByTestId("rating-chip").filter({ hasText: "Yes, with the guide beside me" }).click();
  await page.getByTestId("rating-chip").filter({ hasText: "About right" }).click();
  await page.getByTestId("rating-chip").filter({ hasText: "Some of it" }).click();
  await page.getByTestId("rating-chip").filter({ hasText: /^7$/ }).click();
  await expect(marker.locator("[aria-current=step]")).toHaveText("Conversation");
  await expect(page.getByTestId("learner-bubble").filter({ hasText: "About right" })).toBeVisible();

  const answers = [
    "Rebuilding the workflow step by step with the guide was the most useful part for me.",
    "The Core Agent settings screen was confusing because it has so many options.",
    "Nothing blocked me, although the workspace was slow to load at the start.",
    "I would like a short recap of the Link Generator at the start of the next session.",
  ];
  for (const a of answers) {
    if (await page.getByTestId("summary-screen").isVisible()) break;
    await page.getByLabel("Your answer").fill(a);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByTestId("learner-bubble").filter({ hasText: a })).toBeVisible();
  }
  await expect(marker.locator("[aria-current=step]")).toHaveText("Summary", { timeout: 20_000 });

  const summary = page.getByTestId("summary-screen");
  const points = summary.getByTestId("summary-point");
  const count = await points.count();
  expect(count).toBeGreaterThanOrEqual(3);
  await points.first().fill("Rebuilding the workflow with the guide was the most useful part.");
  await summary.getByRole("button", { name: "Remove point 2" }).click();
  await expect(points).toHaveCount(count - 1);
  await summary.getByLabel("Private, summary only").check();
  await summary.getByRole("button", { name: "Submit feedback" }).click();
  await expect(page.getByTestId("thank-you")).toBeVisible();
  await page.getByRole("button", { name: "Helpful", exact: true }).click();
  await expect(page.getByText("Thanks for rating the interview.")).toBeVisible();

  const db = admin();
  const { data: session } = await db.from("sessions").select("id").eq("number", n).single();
  const { data: iv } = await db.from("interviews").select("anonymity, summary, summary_edited, participant_id, interview_rating").eq("session_id", session!.id).single();
  expect(iv).toMatchObject({ anonymity: "private", participant_id: null, summary_edited: true, interview_rating: "helpful" });
});
