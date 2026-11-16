"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createUserClient } from "@/lib/supabase/server";
import { safeNextPath, signInRedirect } from "@/lib/auth";
import { requestOrigin } from "@/lib/request";

export type SignInState = { status: "idle" | "sent" | "error"; message: string; email?: string };

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export async function requestMagicLink(_prev: SignInState, form: FormData): Promise<SignInState> {
  const parsed = emailSchema.safeParse(form.get("email"));
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };
  const next = safeNextPath(String(form.get("next") ?? "/"));
  const origin = await requestOrigin();
  const db = await createUserClient();
  const { error } = await db.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: signInRedirect(origin, next) },
  });
  if (error && /rate|too many|seconds/i.test(error.message)) {
    return { status: "error", message: "Too many sign-in requests. Wait a minute and try again." };
  }
  // The same message whether or not the address has an account, so this can't be used to find learners.
  return { status: "sent", message: `If ${parsed.data} is registered, a sign-in email is on its way.`, email: parsed.data };
}

export type CodeState = { status: "idle" | "error"; message: string };

/**
 * Signs in with the 6-digit code from a sign-in email, for someone who reads their email on another
 * device than the one they want to use. The code and the link are the same one-time pass.
 */
export async function verifySignInCode(_prev: CodeState, form: FormData): Promise<CodeState> {
  const email = emailSchema.safeParse(form.get("email"));
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  if (!email.success || code.length !== 6) return { status: "error", message: "Enter the 6-digit code from the email." };
  const next = safeNextPath(String(form.get("next") ?? "/"));
  const db = await createUserClient();
  const { error } = await db.auth.verifyOtp({ email: email.data, token: code, type: "email" });
  if (error) {
    return /rate|too many|seconds/i.test(error.message)
      ? { status: "error", message: "Too many tries. Wait a few minutes and try again." }
      : { status: "error", message: "That code didn't work. It may be mistyped, or already used or expired (codes last 24 hours). Ask for a new email." };
  }
  redirect(next);
}
