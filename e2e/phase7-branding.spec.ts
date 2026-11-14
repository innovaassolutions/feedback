import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { admin, rgb, signIn } from "./support";

test("a platform admin creates a third organization, previews and approves its theme, creates a course and invites a learner", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const stamp = Date.now().toString().slice(-6);
  const slug = `harbour-${stamp}`;
  const logo = await sharp({ create: { width: 120, height: 40, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 36, height: 36, channels: 4, background: { r: 196, g: 72, b: 32, alpha: 1 } } }).png().toBuffer(), top: 2, left: 2 }])
    .png()
    .toBuffer();

  await signIn(page, "platformAdmin", "/platform");
  await page.getByLabel("Name").fill("Harbour Learning");
  await page.getByLabel("Address").fill(slug);
  await page.getByLabel("Logo").setInputFiles({ name: "harbour.png", mimeType: "image/png", buffer: logo });
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/settings/brand$`), { timeout: 60_000 });

  // The preview shows the header, a tile, a chart and the chat in the proposed theme.
  const light = page.getByTestId("preview-light");
  for (const part of ["preview-header", "preview-tile", "preview-chat"]) await expect(light.getByTestId(part)).toBeVisible();
  await expect(light.locator("svg.recharts-surface")).toBeVisible();
  const headerBg = () => light.getByTestId("preview-header").evaluate((el) => getComputedStyle(el).backgroundColor);
  const proposed = await headerBg();

  // Changing a color updates the preview.
  await page.getByLabel("light primary").fill("#1b4f8a");
  await expect.poll(headerBg).toBe(rgb("#1b4f8a"));
  expect(proposed).not.toBe(rgb("#1b4f8a"));

  await page.getByRole("button", { name: "Approve and make live" }).click();
  await expect(page.getByText("The theme is live")).toBeVisible();

  // Create a course with no code change.
  await page.getByRole("link", { name: "Courses" }).click();
  await page.getByLabel("Course title").fill("Harbour onboarding");
  await page.getByLabel("Course address").fill("onboarding");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/onboarding/admin$`));

  // The whole organization uses the new theme on the next page load, with its logo.
  await page.reload();
  await expect(page.getByTestId("org-header")).toHaveCSS("background-color", rgb("#1b4f8a"));
  await expect(page.getByTestId("org-logo")).toBeVisible();

  // A session, then invite a learner.
  await page.getByLabel("Title").fill("Welcome");
  await page.getByLabel("Date").fill("2026-12-01");
  await page.getByRole("button", { name: "Create draft session" }).click();
  await expect(page.getByTestId("admin-sessions")).toContainText("Welcome");
  await page.getByRole("link", { name: "Roster" }).click();
  const learnerEmail = `new.learner.${stamp}@harbour.example`;
  await page.getByLabel("Email addresses").fill(learnerEmail);
  await page.getByRole("button", { name: "Invite learners" }).click();
  await expect(page.getByTestId("invite-report")).toContainText("Enrolled 1 learner");
  await expect(page.getByTestId("roster")).toContainText(learnerEmail);

  // The logo on the sign-in page and on the printed report.
  const signedOut = await browser.newPage();
  await signedOut.goto(`/${slug}/sign-in`);
  await expect(signedOut.getByTestId("sign-in-logo")).toBeVisible();
  const { data: org } = await admin().from("organizations").select("id, live_theme_id").eq("slug", slug).single();
  // Reports are for instructors and sponsors: give the new course an instructor to read it.
  const { data: course } = await admin().from("courses").select("id").eq("organization_id", org!.id).eq("slug", "onboarding").single();
  const { data: instructorId } = await admin().rpc("user_id_by_email", { p_email: "owen.marsh@northwind.example" });
  await admin().from("memberships").insert({ organization_id: org!.id, user_id: instructorId as string, role: "instructor", course_id: course!.id, display_name: "Owen Marsh", email: "owen.marsh@northwind.example" });
  const instructor = await browser.newPage();
  await signIn(instructor, "owen", `/${slug}/onboarding/dashboard/sessions/1/print`);
  await expect(instructor.getByTestId("report-logo")).toBeVisible();
  await expect(instructor.getByRole("navigation")).toHaveCount(0);

  const { data: theme } = await admin().from("themes").select("tokens, status").eq("id", org!.live_theme_id!).single();
  expect(theme!.status).toBe("live");
  expect((theme!.tokens as { light: { primary: string } }).light.primary).toBe("#1b4f8a");
});
