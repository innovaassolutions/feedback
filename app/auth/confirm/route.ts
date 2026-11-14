import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth";

/** The magic link lands here. It verifies the one-time token and signs the user in. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;
  const next = safeNextPath(url.searchParams.get("redirect_to") ?? url.searchParams.get("next"));
  if (tokenHash) {
    const db = await createUserClient();
    const { error } = await db.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  const failed = new URL("/sign-in", url.origin);
  failed.searchParams.set("error", "link");
  failed.searchParams.set("next", next);
  return NextResponse.redirect(failed);
}
