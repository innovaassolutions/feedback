import { expect, test } from "@playwright/test";
import { SEED_USERS } from "../lib/server/seed";
import { signIn, waitForSignInLink } from "./support";

const COURSE = "/streamspace/ime-engineering";

test("the session page shows a join link and QR code that lead a signed-out learner through sign-in to the interview", async ({ page, browser }) => {
  await signIn(page, "dana", `${COURSE}/sessions/1`);
  const join = page.getByTestId("join-link");
  await expect(join).toBeVisible();
  await expect(page.getByTestId("join-qr").locator("svg")).toBeVisible();
  const url = await join.getByRole("link").getAttribute("href");
  expect(url).toMatch(/\/streamspace\/ime-engineering\/sessions\/1\/interview$/);

  const learner = await browser.newPage();
  await learner.goto(url!);
  await expect(learner).toHaveURL(/\/streamspace\/sign-in\?next=.*interview/);
  const sentAt = new Date();
  await learner.getByLabel("Email address").fill(SEED_USERS.elena.email);
  await learner.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(learner.getByText("a sign-in link is on its way")).toBeVisible();
  const link = await waitForSignInLink(SEED_USERS.elena.email, sentAt);
  await learner.goto(link);
  await expect(learner).toHaveURL(/\/streamspace\/ime-engineering\/sessions\/1\/interview$/);
  await expect(learner.getByText("Session 1: Rebuilding your first workflow")).toBeVisible();
});

test("an instructor creates a session, uploads a document and sees it read", async ({ page }) => {
  await signIn(page, "marcus", `${COURSE}/admin`);
  const title = `E2E session ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Date").fill("2026-12-11");
  await page.getByLabel("Objectives").fill("Try the admin pages.");
  await page.getByRole("button", { name: "Create draft session" }).click();
  const row = page.getByTestId("admin-sessions").getByRole("listitem").filter({ hasText: title });
  await expect(row).toContainText("Draft");
  await row.getByRole("button", { name: "Move to Upcoming" }).click();
  await expect(row).toContainText("Upcoming");

  await row.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByLabel("File").setInputFiles({
    name: "guide.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Guide\n\n## Link Generator\n\nUse the Link Generator to share results with your team members."),
  });
  await page.getByRole("button", { name: "Upload document" }).click();
  const list = page.getByTestId("document-list");
  await expect(list).toContainText("guide");
  await expect(list).toContainText("Ready", { timeout: 30_000 });
  await expect(page.getByTestId("brief-editor").getByLabel("Topics covered")).toHaveValue(/Link Generator/, { timeout: 30_000 });
});

test("a corrupt upload shows a failure message on the administration page", async ({ page }) => {
  await signIn(page, "marcus", `${COURSE}/admin/sessions/3`);
  await page.getByLabel("File").setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 not a real pdf") });
  await page.getByLabel("Title").fill(`Broken ${Date.now()}`);
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByTestId("document-list").getByRole("alert").first()).toContainText("couldn't read this PDF", { timeout: 30_000 });
});
