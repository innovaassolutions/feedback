import { expect, test, type Page } from "@playwright/test";
import { STREAMSPACE_THEME, SEED_USERS, STREAMSPACE_LEARNERS } from "../lib/server/seed";
import { seedDemoInterviews } from "../lib/server/demo";
import { admin, rgb, signIn } from "./support";

const COURSE = "/streamspace/ime-engineering";

async function sessionWithDemo(title: string, keep = 7): Promise<{ id: string; number: number }> {
  const db = admin();
  const { data: course } = await db.from("courses").select("id, organization_id").eq("slug", "ime-engineering").single();
  const number = 500 + Math.floor(Math.random() * 9000);
  const { data: session, error } = await db
    .from("sessions")
    .insert({ organization_id: course!.organization_id, course_id: course!.id, number, title, date: "2026-12-04", state: "open", opened_at: new Date().toISOString() })
    .select("id, number")
    .single();
  if (error) throw error;
  const learners: string[] = [];
  for (const key of STREAMSPACE_LEARNERS.slice(0, 7)) {
    const { data } = await db.rpc("user_id_by_email", { p_email: SEED_USERS[key].email });
    learners.push(data as string);
  }
  await seedDemoInterviews(db as never, session!.id, learners);
  if (keep < 7) {
    const { data: rows } = await db.from("interviews").select("id, anonymity").eq("session_id", session!.id);
    const drop = (rows ?? []).filter((r) => r.anonymity !== "named").slice(0, 7 - keep).map((r) => r.id);
    await db.from("interviews").delete().in("id", drop);
  }
  return session!;
}

function consoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("the dashboard shows the tiles, and each chart renders with a table view holding the same numbers", async ({ page }) => {
  const s = await sessionWithDemo("Dashboard charts");
  await signIn(page, "marcus", `${COURSE}/dashboard/sessions/${s.number}`);
  await expect(page.getByTestId("tile-responses-value")).toHaveText(/^7 of \d+$/);
  await expect(page.getByTestId("tile-able-value")).toHaveText("5 of 7");
  await expect(page.getByTestId("tile-pace-value")).toHaveText("4 of 7");
  await expect(page.getByTestId("tile-recommend-value")).toHaveText("7.7");
  await expect(page.getByTestId("tile-nps")).toHaveCount(0);

  const api = await (await page.request.get(`/api/sessions/${s.id}/results`)).json();
  for (const id of ["ability", "pace", "themes", "trend"]) {
    const card = page.getByTestId(`chart-${id}`);
    await expect(card.locator("svg.recharts-surface").first()).toBeVisible();
    await card.getByRole("button", { name: "Show table" }).click();
    await expect(card.getByTestId(`table-${id}`)).toBeVisible();
  }
  const rowsOf = async (id: string) =>
    page.getByTestId(`table-${id}`).locator("tbody tr").evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent)));
  expect(await rowsOf("ability")).toEqual(api.charts.ability.map((a: { label: string; count: number }) => [a.label, String(a.count)]));
  expect(await rowsOf("pace")).toEqual(api.charts.pace.map((a: { label: string; count: number }) => [a.label, String(a.count)]));
  expect(await rowsOf("themes")).toEqual(api.charts.themes.map((t: { theme: string; positive: number; negative: number }) => [t.theme, String(t.positive), String(t.negative)]));
  const trend = await rowsOf("trend");
  expect(trend.find((r) => r[0] === `S${s.number}`)).toEqual([`S${s.number}`, "7", "71%", "57%", "7.7"]);
});

test("the print view has no navigation and fits an A4 page width", async ({ page }) => {
  const s = await sessionWithDemo("Print view");
  await page.setViewportSize({ width: 794, height: 1123 }); // A4 at 96 dpi
  await signIn(page, "marcus", `${COURSE}/dashboard/sessions/${s.number}/print`);
  await expect(page.getByTestId("print-report")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByTestId("org-header")).toHaveCount(0);
  await expect(page.getByTestId("report-logo")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(794);
  const pdf = await page.pdf({ format: "A4", printBackground: true });
  expect(pdf.byteLength).toBeGreaterThan(1000);
});

for (const scheme of ["light", "dark"] as const) {
  test(`charts use the organization's chart colors in ${scheme} mode, with no console errors`, async ({ browser }) => {
    const s = await sessionWithDemo(`Colors ${scheme}`);
    const page = await browser.newPage({ colorScheme: scheme });
    const errors = consoleErrors(page);
    await signIn(page, "marcus", `${COURSE}/dashboard/sessions/${s.number}`);
    const bar = page.getByTestId("chart-ability").locator(".recharts-bar-rectangle path").first();
    await expect(bar).toBeVisible();
    const fill = await bar.evaluate((el) => getComputedStyle(el).fill);
    expect(fill).toBe(rgb(STREAMSPACE_THEME[scheme].chart[0]));
    const negative = page.getByTestId("chart-themes").locator(".recharts-bar-rectangle path").last();
    expect(await negative.evaluate((el) => getComputedStyle(el).fill)).toBe(rgb(STREAMSPACE_THEME[scheme].chart[3]));
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
}

test("with four responses the page says results appear once 5 learners have responded", async ({ page }) => {
  const s = await sessionWithDemo("Small group", 4);
  await signIn(page, "marcus", `${COURSE}/dashboard/sessions/${s.number}`);
  await expect(page.getByTestId("results-hidden")).toContainText("Results appear once 5 learners have responded");
  await expect(page.getByTestId("tiles")).toHaveCount(0);
});
