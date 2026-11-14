import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth";
import { requestOrigin } from "@/lib/request";

/** The magic link lands here. It verifies the one-time token and signs the user in. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = (params.get("type") ?? "email") as EmailOtpType;
  const next = safeNextPath(params.get("next") ?? params.get("redirect_to"));
  // The origin from the Host header, so the person stays on the address the link used (in
  // development request.url always says localhost, which breaks signing in from a phone).
  const origin = await requestOrigin();
  if (tokenHash) {
    const db = await createUserClient();
    const { error } = await db.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  const failed = new URL("/sign-in", origin);
  failed.searchParams.set("error", "link");
  failed.searchParams.set("next", next);
  return NextResponse.redirect(failed);
}
