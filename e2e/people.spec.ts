import { expect, test } from "@playwright/test";
import { inbox, signIn } from "./support";

test("an organization admin adds a sponsor, who is emailed an invitation, and removes them again", async ({ page }) => {
  const email = `exec.${Date.now()}@staff.example`;
  // With one course, the organization's address opens the course; its header links to People.
  await signIn(page, "dana", "/streamspace");
  await page.getByRole("link", { name: "People" }).click();
  await expect(page.getByRole("heading", { name: "People", level: 1 })).toBeVisible();

  const form = page.getByTestId("add-person");
  await form.getByLabel("Name").fill("Jordan Exec");
  await form.getByLabel("Email address").fill(email);
  await form.getByRole("radio", { name: /Sponsor/ }).check();
  await expect(form.getByText("For executives and managers.")).toBeVisible();
  // Other tests may add courses to the organization while this runs, so choose this one by name.
  await form.locator('select[name="course_id"]').selectOption({ label: "Streamspace platform training: IME Engineering" });
  await form.getByRole("button", { name: "Add and email a sign-in link" }).click();
  await expect(form.getByText("Added Jordan Exec as sponsor on Streamspace platform training: IME Engineering. A sign-in email is on its way to them.")).toBeVisible();

  const course = page.locator('[data-testid^="course-people-"]').filter({ hasText: "IME Engineering" });
  await expect(course).toContainText(email);
  await expect.poll(async () => (await inbox(email)).map((m) => m.Subject), { timeout: 20_000 }).toContain(
    "You can now view the results of Streamspace platform training: IME Engineering",
  );

  await course.getByRole("button", { name: "Remove Jordan Exec as sponsor on Streamspace platform training: IME Engineering" }).click();
  await course.getByRole("button", { name: "Yes, remove" }).click();
  await expect(course).not.toContainText(email);
});

test("the platform page lists platform admins and can add one", async ({ page }) => {
  const email = `platform.${Date.now()}@staff.example`;
  await signIn(page, "platformAdmin", "/platform");
  const card = page.getByTestId("platform-admins");
  await expect(card).toContainText("You");
  await card.getByLabel("Name").fill("Quinn Platform");
  await card.getByLabel("Email address").fill(email);
  await card.getByRole("button", { name: "Add and email a sign-in link" }).click();
  await expect(card.getByText("Added Quinn Platform as a platform admin.", { exact: false })).toBeVisible();
  await expect(card).toContainText(email);
});

test("an instructor pastes a whole class list, longer than one address field, in the forms people use", async ({ page }) => {
  const stamp = Date.now();
  const lines = [
    ...Array.from({ length: 12 }, (_, i) => `Class Learner${i} <class.${stamp}.${i}@roster.example>`),
    `Lovelace, Ada <ada.${stamp}@roster.example>`,
    `Grace Hopper\tgrace.${stamp}@roster.example`,
  ];
  expect(lines.join("\n").length).toBeGreaterThan(320);
  await signIn(page, "marcus", "/streamspace/ime-engineering/admin/roster");
  await page.getByLabel("Email addresses").fill(lines.join("\n"));
  await page.getByRole("button", { name: "Invite learners" }).click();
  await expect(page.getByTestId("invite-report")).toContainText("Enrolled 14 learners", { timeout: 60_000 });
  await expect(page.getByTestId("roster")).toContainText("Lovelace, Ada");
  await expect(page.getByTestId("roster")).toContainText("Grace Hopper");
});
