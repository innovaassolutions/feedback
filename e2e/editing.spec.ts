import { expect, test } from "@playwright/test";
import { signIn } from "./support";

test("an organization admin renames a course and its session, then deletes them", async ({ page }) => {
  const stamp = Date.now().toString().slice(-6);
  await signIn(page, "dana", "/streamspace/settings/courses");
  // A course created by mistake, named like a session.
  await page.getByLabel("Course title").fill(`Session 1 - Foundation ${stamp}`);
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // Managers see Course setup and Learner view, not a second "Sessions".
  const header = page.getByTestId("org-header");
  await expect(header.getByRole("link", { name: "Course setup" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Learner view" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Sessions", exact: true })).toHaveCount(0);

  // The dev server compiles a page on first use; wait for the form before using it.
  await expect(page.getByRole("button", { name: "Add session" })).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Title").fill("Foundation");
  await page.getByLabel("Date").fill("2026-12-01");
  await page.getByRole("button", { name: "Add session" }).click();
  await expect(page.getByTestId("admin-sessions")).toContainText("Session 1: Foundation", { timeout: 30_000 });

  // Rename the course.
  await page.getByRole("link", { name: "Rename or change settings" }).click();
  const details = page.getByTestId("course-details");
  await details.getByLabel("Course title").fill(`Foundation programme ${stamp}`);
  await details.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("setup-course-title")).toHaveText(`Foundation programme ${stamp}`);

  // Rename the session.
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await page.getByRole("link", { name: "Session 1: Foundation" }).click();
  await page.getByRole("button", { name: "Edit details" }).click();
  const session = page.getByTestId("session-details");
  await session.getByLabel("Title").fill("Foundations of the platform");
  await session.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Session 1: Foundations of the platform" })).toBeVisible();

  // Delete the session, then the course.
  await page.getByRole("button", { name: "Delete session Session 1" }).click();
  await page.getByRole("button", { name: "Yes, delete session" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("admin-sessions")).toContainText("No sessions yet");
  await page.getByRole("link", { name: "Course details" }).click();
  await page.getByRole("button", { name: /^Delete course/ }).click();
  await page.getByRole("button", { name: "Yes, delete course" }).click();
  await expect(page).toHaveURL(/\/streamspace\/settings\/courses$/);
  await expect(page.getByTestId("course-list")).not.toContainText(`Foundation programme ${stamp}`);
});
