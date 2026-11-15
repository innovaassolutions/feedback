import { expect, test, type Page } from "@playwright/test";
import { admin, signIn } from "./support";

async function openSession(title: string): Promise<number> {
  const db = admin();
  const { data: course } = await db.from("courses").select("id, organization_id").eq("slug", "ime-engineering").single();
  const number = 20000 + Math.floor(Math.random() * 9000);
  const { error } = await db.from("sessions").insert({ organization_id: course!.organization_id, course_id: course!.id, number, title, date: "2026-12-04", state: "open", opened_at: new Date().toISOString() });
  if (error) throw error;
  return number;
}

/** Records microphone requests, and stands in for Vocal Bridge so the test never calls it. */
async function installFakeVoice(page: Page, opts: { refuseMicrophone?: boolean } = {}) {
  await page.addInitScript((refuse) => {
    const w = window as unknown as Record<string, unknown>;
    w.__micRequests = 0;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      (w.__micRequests as number)++;
      if (refuse) throw new DOMException("Permission denied", "NotAllowedError");
      return original(c);
    };
    if (refuse) return;
    w.__vocalBridgeFactory = () => {
      const handlers: Record<string, Array<(e: unknown) => void>> = {};
      let query: ((q: string) => Promise<string>) | null = null;
      const fake = {
        spoken: [] as string[],
        readAloud: [] as string[],
        async sendAction(action: string, payload?: { text?: string }) {
          if (action === "read_aloud") fake.readAloud.push(payload?.text ?? "");
        },
        on(event: string, h: (e: unknown) => void) {
          (handlers[event] ??= []).push(h);
        },
        onAIAgentQuery(h: (q: string) => Promise<string>) {
          query = h;
        },
        async connect() {},
        async disconnect() {},
        async setMicrophoneEnabled() {},
        async say(text: string) {
          for (const h of handlers.transcript ?? []) h({ role: "user", text: text.slice(0, 10) });
          const reply = await query!(text);
          fake.spoken.push(reply);
          return reply;
        },
      };
      w.__fakeVoice = fake;
      return fake;
    };
  }, opts.refuseMicrophone ?? false);
}

async function startInterview(page: Page, learner: string, n: number) {
  await signIn(page, learner, `/streamspace/ime-engineering/sessions/${n}/interview`);
  await page.getByRole("button", { name: "Start the interview" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByTestId("rating-chip").first()).toBeVisible();
}

test("the microphone asks for permission, spoken turns appear marked with a microphone, and typing carries on the same interview", async ({ page }) => {
  const n = await openSession("Voice in the browser");
  await installFakeVoice(page);
  await startInterview(page, "hamish", n);

  await page.getByTestId("mic-button").click();
  await expect(page.getByTestId("mic-button")).toHaveAttribute("data-state", "on");
  expect(await page.evaluate(() => (window as unknown as { __micRequests: number }).__micRequests)).toBeGreaterThan(0);
  const readAloud = () => page.evaluate(() => (window as unknown as { __fakeVoice: { readAloud: string[] } }).__fakeVoice.readAloud);
  // The question waiting on screen is read aloud as soon as voice starts.
  await expect.poll(readAloud).toHaveLength(1);
  expect((await readAloud())[0]).toContain("Could you now do what this session taught");

  const reply = await page.evaluate(() => (window as unknown as { __fakeVoice: { say: (t: string) => Promise<string> } }).__fakeVoice.say("Yes, with the guide beside me"));
  expect(reply).toMatch(/pace/i);
  // The reply is spoken as the turn's answer, so it isn't read aloud a second time.
  await expect(page.getByTestId("interviewer-bubble").last()).toContainText(/pace/i);
  expect(await readAloud()).toHaveLength(1);

  // A chip tap while listening: its next question is read aloud.
  await page.getByTestId("rating-chip").filter({ hasText: "About right" }).click();
  await expect(page.getByTestId("interviewer-bubble").last()).toContainText("How much of this session will you use in your work?");
  await expect.poll(async () => (await readAloud()).at(-1)).toContain("How much of this session will you use in your work?");
  await page.getByTestId("mic-button").click();
  const spoken = page.getByTestId("learner-bubble").filter({ hasText: "Yes, with the guide beside me" });
  await expect(spoken).toHaveAttribute("data-mode", "voice");
  await expect(spoken.getByLabel("Spoken")).toBeVisible();

  // Back to typing: the same interview continues with the next item.
  await page.getByLabel("Your answer").fill("Most of it");
  await page.getByRole("button", { name: "Send" }).click();
  const typed = page.getByTestId("learner-bubble").filter({ hasText: "Most of it" });
  await expect(typed).toHaveAttribute("data-mode", "text");
  await expect(page.getByTestId("interviewer-bubble").last()).toContainText(/recommend/i);
});

test("with the microphone refused the chat still works and shows a notice", async ({ page }) => {
  const n = await openSession("Microphone refused");
  await installFakeVoice(page, { refuseMicrophone: true });
  await startInterview(page, "farid", n);
  await page.getByTestId("mic-button").click();
  await expect(page.getByRole("alert").filter({ hasText: "couldn't use your microphone" })).toBeVisible();
  await page.getByTestId("rating-chip").filter({ hasText: "Not yet" }).click();
  await expect(page.getByTestId("learner-bubble").filter({ hasText: "Not yet" })).toBeVisible();
});

test("with the voice service unreachable the chat still works and shows a notice", async ({ page }) => {
  const n = await openSession("Voice service down");
  await startInterview(page, "elena", n);
  await page.getByTestId("mic-button").click();
  await expect(page.getByRole("alert").filter({ hasText: "Voice isn't available right now" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("mic-button")).toHaveAttribute("data-state", "off");
  await page.getByLabel("Your answer").fill("Yes, without help");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("learner-bubble").filter({ hasText: "Yes, without help" })).toBeVisible();
});
