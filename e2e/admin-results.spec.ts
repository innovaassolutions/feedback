import { expect, test } from "@playwright/test";
import { admin, signIn } from "./support";

test("the platform admin sees a course's Dashboard and its transcripts", async ({ page }) => {
  await signIn(page, "platformAdmin", "/streamspace/ime-engineering");
  const header = page.getByTestId("org-header");
  await header.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/streamspace\/ime-engineering\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the platform admin sees a session's waiting questions in Course setup and answers one", async ({ page }) => {
  const db = admin();
  // A course of its own, so other tests counting the demo course's sessions aren't affected.
  const { data: org } = await db.from("organizations").select("id").eq("slug", "streamspace").single();
  const slug = `admin-qa-${Date.now().toString().slice(-7)}`;
  const { data: course } = await db.from("courses").insert({ organization_id: org!.id, slug, title: "Admin Q&A course" }).select("id, organization_id").single();
  const number = 1;
  const { data: session } = await db.from("sessions").insert({ organization_id: course!.organization_id, course_id: course!.id, number, title: "Admin Q&A", date: "2026-12-04", state: "open", opened_at: new Date().toISOString() }).select("id").single();
  await db.from("questions").insert({ organization_id: course!.organization_id, course_id: course!.id, session_id: session!.id, text: "Will the slides be shared after the session?", state: "needs_instructor", origin: "board" });

  await signIn(page, "platformAdmin", `/streamspace/${slug}/admin`);
  const row = page.getByTestId("admin-sessions").getByRole("listitem").filter({ hasText: `Session ${number}: Admin Q&A` }).first();
  await expect(row.getByTestId("session-questions")).toHaveText("Q&A: 1 question, 1 waiting for an answer");
  await row.getByTestId("session-questions").click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${number}#questions$`));
  const q = page.getByTestId("question").filter({ hasText: "Will the slides be shared after the session?" });
  await q.getByRole("button", { name: /^(Answer|Replace with my answer)$/ }).click();
  await q.getByLabel("Your answer").fill("Yes, on the session page by Friday.");
  await q.getByRole("button", { name: "Save answer" }).click();
  await expect(q.getByTestId("answer")).toContainText("on the session page by Friday");

  // A duplicate is removed, after a confirmation.
  await db.from("questions").insert({ organization_id: course!.organization_id, course_id: course!.id, session_id: session!.id, text: "Duplicate: will the slides be shared?", state: "needs_instructor", origin: "interview" });
  await page.reload();
  const dup = page.getByTestId("question").filter({ hasText: "Duplicate: will the slides be shared?" });
  await dup.getByRole("button", { name: "Delete question" }).click();
  await dup.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByTestId("question").filter({ hasText: "Duplicate: will the slides be shared?" })).toHaveCount(0);
});
