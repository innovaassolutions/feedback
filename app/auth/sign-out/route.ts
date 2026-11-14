import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/request";

export async function POST() {
  const db = await createUserClient();
  await db.auth.signOut();
  // The origin from the Host header: in development request.url always says localhost.
  return NextResponse.redirect(new URL("/sign-in", await requestOrigin()), { status: 303 });
}
