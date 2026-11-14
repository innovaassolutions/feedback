import { expect, test } from "@playwright/test";
import { NORTHWIND_THEME, SEED_USERS, STREAMSPACE_THEME } from "../lib/server/seed";
import { rgb, signIn, waitForSignInLink } from "./support";

const COURSE = "/streamspace/ime-engineering";

test("a learner signs in by magic link and lands on the course page", async ({ page }) => {
  await page.goto(COURSE);
  await expect(page).toHaveURL(/\/streamspace\/sign-in\?next=/);
  await expect(page.getByTestId("sign-in-logo")).toBeVisible();

  const sentAt = new Date();
  await page.getByLabel("Email address").fill(SEED_USERS.aisha.email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("a sign-in link is on its way")).toBeVisible();

  const link = await waitForSignInLink(SEED_USERS.aisha.email, sentAt);
  await page.goto(link);
  await expect(page).toHaveURL(new RegExp(`${COURSE}$`));

  const list = page.getByTestId("session-list");
  await expect(list.getByRole("listitem").filter({ hasText: "Session 1" })).toContainText("Feedback open");
  await expect(list.getByRole("listitem").filter({ hasText: "Session 2" })).toContainText("Upcoming");
  await expect(list).not.toContainText("Session 3");
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
});

test("an instructor sees all three sessions and an Admin link", async ({ page }) => {
  await signIn(page, "marcus", COURSE);
  const list = page.getByTestId("session-list");
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list.getByRole("listitem").filter({ hasText: "Session 3" })).toContainText("Draft");
  await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
});

test("a learner gets Page not found on the admin page", async ({ page }) => {
  await signIn(page, "ben", `${COURSE}/admin`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("an unknown course and someone else's course both show Course not found", async ({ page }) => {
  await signIn(page, "chloe", "/streamspace/no-such-course");
  await expect(page.getByRole("heading", { name: "Course not found" })).toBeVisible();
  await page.goto("/northwind/customer-onboarding");
  await expect(page.getByRole("heading", { name: "Course not found" })).toBeVisible();
});

test("each organization's header uses its own theme", async ({ browser }) => {
  const streamspace = await browser.newPage({ colorScheme: "light" });
  await signIn(streamspace, "diego", COURSE);
  const northwind = await browser.newPage({ colorScheme: "light" });
  await signIn(northwind, "isla", "/northwind/customer-onboarding");

  const bg = (p: typeof streamspace) =>
    p.getByTestId("org-header").evaluate((el) => getComputedStyle(el).backgroundColor);
  const a = await bg(streamspace);
  const b = await bg(northwind);
  expect(a).toBe(rgb(STREAMSPACE_THEME.light.primary));
  expect(b).toBe(rgb(NORTHWIND_THEME.light.primary));
  expect(a).not.toBe(b);

  const dark = await browser.newPage({ colorScheme: "dark" });
  await signIn(dark, "diego", COURSE);
  expect(await bg(dark)).toBe(rgb(STREAMSPACE_THEME.dark.primary));
});
