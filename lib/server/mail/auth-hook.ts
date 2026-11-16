import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Mailer } from "@/lib/server/email";
import type { AdminClient } from "@/lib/server/supabase-admin";
import { brandForSignIn } from "./brand";
import { brandedEmail } from "./layout";

// Supabase Auth's send-email hook. Auth still creates and checks every sign-in link and applies its
// rate limits; it hands the email to the app instead of sending it, so the email can carry the
// person's organization's branding. Requests are signed in the Standard Webhooks format.

/** Supabase signs each request; an unsigned, altered or replayed one is refused. */
export function verifyHookSignature(body: string, headers: Headers, secret: string, nowMs = Date.now()): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > 5 * 60) return false;
  const key = Buffer.from(secret.replace(/^v1,whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) return false;
    const given = Buffer.from(signature, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

const payloadSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    app_metadata: z.record(z.string(), z.unknown()).nullish(),
  }),
  email_data: z.object({
    token_hash: z.string().min(1),
    redirect_to: z.string().nullish(),
    email_action_type: z.string(),
  }),
});

// The one-time token types the confirm route verifies. The platform has no passwords and no email
// changes, so those emails are never asked for.
const LINK_TYPES: Record<string, string> = { magiclink: "email", signup: "email", invite: "invite" };

/**
 * The sign-in link, as the old email template built it: the confirm address the app asked for
 * (keeping the address the person is using and where to go next), or the app's own.
 */
export function signInLink(redirectTo: string | null | undefined, appUrl: string, type: string, tokenHash: string): URL {
  let url: URL | null = null;
  try {
    url = redirectTo ? new URL(redirectTo) : null;
  } catch {
    url = null;
  }
  if (!url || url.pathname !== "/auth/confirm") url = new URL("/auth/confirm", appUrl);
  url.searchParams.set("type", type);
  url.searchParams.set("token_hash", tokenHash);
  return url;
}

export class HookError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type HookDeps = { admin: AdminClient; mailer: Mailer; appUrl: string };

export async function sendAuthEmail(input: unknown, deps: HookDeps): Promise<void> {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) throw new HookError(400, "The hook payload isn't one this app understands.");
  const { user, email_data: data } = parsed.data;
  const type = LINK_TYPES[data.email_action_type];
  if (!type) throw new HookError(400, `This platform doesn't send ${data.email_action_type} emails.`);

  const link = signInLink(data.redirect_to, deps.appUrl, type, data.token_hash);
  const { brand, otherOrganization } = await brandForSignIn(
    deps.admin,
    { id: user.id, platformAdmin: user.app_metadata?.platform_admin === true },
    link.searchParams.get("next"),
  );
  // A page of an organization the person isn't in would only show "Page not found", and its
  // address would name that organization in the email. Their own courses page instead.
  if (otherOrganization) link.searchParams.set("next", "/");
  await deps.mailer.send(
    brandedEmail(user.email, brand.organization ? `Your sign-in link for ${brand.name}` : "Your sign-in link", brand, {
      preview: "It works once and expires in an hour.",
      heading: "Sign in",
      body: [brand.organization ? `Use this button to sign in to ${brand.name}. It works once and expires in an hour.` : "Use this button to sign in. It works once and expires in an hour."],
      button: { label: "Sign in", url: link.toString() },
      note: "If you didn't ask for this, you can ignore this email.",
    }),
  );
}

function hookError(status: number, message: string): Response {
  return Response.json({ error: { http_code: status, message } }, { status });
}

/** The whole request: check the signature, then send. Auth shows the error message if it fails. */
export async function handleSendEmailHook(request: Request, deps: HookDeps & { secret: string | undefined; nowMs?: number }): Promise<Response> {
  if (!deps.secret) return hookError(500, "The send-email hook has no secret configured.");
  const body = await request.text();
  if (!verifyHookSignature(body, request.headers, deps.secret, deps.nowMs)) return hookError(401, "The hook signature didn't match.");
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return hookError(400, "The hook payload isn't JSON.");
  }
  try {
    await sendAuthEmail(payload, deps);
    return Response.json({});
  } catch (e) {
    if (e instanceof HookError) return hookError(e.status, e.message);
    // The cause, never the address or the link.
    console.error(`[send-email hook] ${e instanceof Error ? e.message : "failed"}`);
    return hookError(500, "The sign-in email couldn't be sent. Try again in a minute.");
  }
}
