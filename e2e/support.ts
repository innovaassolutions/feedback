import { expect, type Page } from "@playwright/test";
import { adminClient } from "../lib/server/supabase-admin";
import { SEED_USERS, type SeedUserKey } from "../lib/server/seed";

/** The secret-key client from lib/server, pointed at the test stack by playwright.config.ts. */
export function admin() {
  return adminClient();
}

export function emailOf(who: SeedUserKey | string): string {
  return who in SEED_USERS ? SEED_USERS[who as SeedUserKey].email : who;
}

/**
 * Signs in the way a magic link does, without going through the inbox. A newer link for the same
 * person replaces an older one, so tests running in parallel as the same user retry.
 */
export async function signIn(page: Page, who: SeedUserKey | string, next = "/") {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email: emailOf(who) });
    if (error) throw error;
    const url = `/auth/confirm?token_hash=${data.properties.hashed_token}&type=email&redirect_to=${encodeURIComponent(next)}`;
    await page.goto(url);
    if (!page.url().includes("error=link")) return;
    await page.waitForTimeout(200 * attempt);
  }
  throw new Error(`Couldn't sign in as ${String(who)}`);
}

type MailSummary = { ID: string; Subject: string; To: Array<{ Address: string }>; Created: string };

/** Messages in the test stack's mail inbox for one address, newest first. */
export async function inbox(address: string): Promise<MailSummary[]> {
  const base = process.env.MAILPIT_URL!;
  const res = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  if (!res.ok) throw new Error(`mailpit search failed: ${res.status}`);
  const body = (await res.json()) as { messages: MailSummary[] };
  return body.messages ?? [];
}

export async function messageHtml(id: string): Promise<string> {
  const res = await fetch(`${process.env.MAILPIT_URL}/api/v1/message/${id}`);
  const body = (await res.json()) as { HTML: string; Text: string };
  return body.HTML || body.Text;
}

/** Waits for a new sign-in email and returns its link. */
export async function waitForSignInLink(address: string, after: Date): Promise<string> {
  let link: string | null = null;
  await expect
    .poll(async () => {
      const messages = (await inbox(address)).filter((m) => new Date(m.Created) >= new Date(after.getTime() - 1000));
      if (!messages.length) return false;
      const html = await messageHtml(messages[0].ID);
      const m = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(html);
      link = m ? m[1].replace(/&amp;/g, "&") : null;
      return Boolean(link);
    }, { timeout: 20_000 })
    .toBe(true);
  return link!;
}

/** Converts a CSS hex color to the rgb() form the browser reports. */
export function rgb(hex: string): string {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
}
