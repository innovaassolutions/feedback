import { mailer } from "@/lib/server/email";
import { handleSendEmailHook } from "@/lib/server/mail/auth-hook";
import { adminClient } from "@/lib/server/supabase-admin";
import { publicEnv } from "@/lib/env";

/** Supabase Auth calls this to send sign-in emails, so each carries its organization's branding. */
export async function POST(request: Request) {
  return handleSendEmailHook(request, {
    admin: adminClient(),
    mailer: mailer(),
    appUrl: publicEnv.appUrl,
    secret: process.env.SEND_EMAIL_HOOK_SECRET,
  });
}
