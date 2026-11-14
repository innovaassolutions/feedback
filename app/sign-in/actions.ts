"use server";
import { z } from "zod";
import { createUserClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth";
import { requestOrigin } from "@/lib/request";

export type SignInState = { status: "idle" | "sent" | "error"; message: string };

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export async function requestMagicLink(_prev: SignInState, form: FormData): Promise<SignInState> {
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };
  const next = safeNextPath(String(form.get("next") ?? "/"));
  const origin = await requestOrigin();
  const db = await createUserClient();
  const { error } = await db.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}${next}` },
  });
  if (error && /rate|too many|seconds/i.test(error.message)) {
    return { status: "error", message: "Too many sign-in requests. Wait a minute and try again." };
  }
  // The same message whether or not the address has an account, so this can't be used to find learners.
  return { status: "sent", message: `If ${parsed.data} is registered, a sign-in link is on its way. Open it on this device.` };
}
