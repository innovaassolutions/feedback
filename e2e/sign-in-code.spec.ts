import { expect, test } from "@playwright/test";
import { SEED_USERS } from "../lib/server/seed";
import { inbox, messageHtml } from "./support";

test("a learner who reads the email on their phone signs in on the computer with its code", async ({ page }) => {
  const email = SEED_USERS.lena.email;
  await page.goto("/northwind/sign-in");
  const sentAt = new Date();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("a sign-in email is on its way")).toBeVisible();

  // The email carries the code as well as the link.
  let code = "";
  await expect
    .poll(async () => {
      const [latest] = (await inbox(email)).filter((m) => new Date(m.Created) >= new Date(sentAt.getTime() - 1000));
      if (!latest) return false;
      const html = await messageHtml(latest.ID);
      code = /(\d{3}) (\d{3})<\/p>/.exec(html)?.slice(1).join("") ?? "";
      return code.length === 6;
    }, { timeout: 20_000 })
    .toBe(true);

  // A wrong code is refused; the right one signs in on this device.
  const form = page.getByTestId("sign-in-code");
  await form.getByLabel("Code from the email").fill("000000");
  await form.getByRole("button", { name: "Sign in with the code" }).click();
  await expect(form.getByText("That code didn't work")).toBeVisible();
  await form.getByLabel("Code from the email").fill(`${code.slice(0, 3)} ${code.slice(3)}`);
  await form.getByRole("button", { name: "Sign in with the code" }).click();
  await expect(page).toHaveURL(/\/northwind\/customer-onboarding$/, { timeout: 15_000 });
});
