import { expect, test } from "@playwright/test";

test("the user guide opens signed out, uses the platform theme's colors, and its search finds pages", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Read the user guide" }).click();
  await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Giving feedback" }).first().click();
  await expect(page).toHaveURL(/\/docs\/learners\/giving-feedback$/);
  await expect(page.getByRole("heading", { name: "1. Before we start" })).toBeVisible();

  // Fumadocs' colors are the theme's variables, not its own palette.
  const colors = await page.evaluate(() => {
    const probe = (value: string) => {
      const el = document.createElement("span");
      el.style.color = value;
      document.body.appendChild(el);
      const color = getComputedStyle(el).color;
      el.remove();
      return color;
    };
    return {
      primary: probe("var(--primary)"),
      fdPrimary: probe("var(--color-fd-primary)"),
      text: probe("var(--text)"),
      fdForeground: probe("var(--color-fd-foreground)"),
    };
  });
  expect(colors.fdPrimary).toBe(colors.primary);
  expect(colors.fdForeground).toBe(colors.text);

  const res = await request.get("/api/search?query=anonymous");
  expect(res.ok()).toBe(true);
  const hits = (await res.json()) as Array<{ url: string }>;
  expect(hits.some((h) => h.url.startsWith("/docs/learners/anonymity"))).toBe(true);
});
