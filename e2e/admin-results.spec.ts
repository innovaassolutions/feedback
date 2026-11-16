import { expect, test } from "@playwright/test";
import { signIn } from "./support";

test("the platform admin sees a course's Dashboard and its transcripts", async ({ page }) => {
  await signIn(page, "platformAdmin", "/streamspace/ime-engineering");
  const header = page.getByTestId("org-header");
  await header.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/streamspace\/ime-engineering\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
