import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { signInRedirect } from "@/lib/auth";
import type { Ctx } from "@/lib/server/ctx";
import type { OperationInput } from "@/lib/operations";
import { courseForUser, requireManage } from "./common";

const emailSchema = z.email();

/** "Ada Lovelace <ada@example.com>" or just the address. */
export function parseInvitee(entry: string): { email: string; name: string } | null {
  const trimmed = entry.trim();
  const angle = /^(.*?)<([^>]+)>$/.exec(trimmed);
  const email = (angle ? angle[2] : trimmed).trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) return null;
  const given = angle ? angle[1].trim().replace(/^"|"$/g, "") : "";
  const name =
    given ||
    email
      .split("@")[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join(" ");
  return { email, name };
}

/** Splits pasted text on commas, semicolons and new lines, keeping "Name <email>" together. */
export function splitPasted(text: string): string[] {
  return text.split(/[\n;,]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Enrolls learners and sends each a magic link. Duplicates (already enrolled, or repeated in
 * the list) are skipped and reported, and so are invalid addresses.
 */
export async function inviteLearners(ctx: Ctx, input: OperationInput<"invite_learners">) {
  const course = await courseForUser(ctx, input.course_id);
  await requireManage(ctx, course.id);

  const { data: existing } = await ctx.db.from("enrollments").select("email").eq("course_id", course.id);
  const enrolledEmails = new Set((existing ?? []).map((e) => e.email.toLowerCase()));
  const seen = new Set<string>();
  const enrolled: Array<{ email: string; name: string }> = [];
  const skipped: Array<{ email: string; reason: string }> = [];
  const invalid: string[] = [];

  const mailClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const redirect = signInRedirect(ctx.origin, `/${course.organizations.slug}/${course.slug}`);
  const resent: string[] = [];
  // Addresses whose email Auth wouldn't send yet: a limit was reached (one per address a minute,
  // a cap per sender, or the email service's daily limit). They're enrolled; inviting them again resends.
  const unsent: string[] = [];
  const sendLink = async (email: string) => {
    const sent = await mailClient.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirect } });
    if (sent.error) console.error(`[invite_learners] invitation not sent: ${sent.error.name}`);
    return !sent.error;
  };

  for (const entry of input.emails.flatMap(splitPasted)) {
    const invitee = parseInvitee(entry);
    if (!invitee) {
      invalid.push(entry);
      continue;
    }
    if (seen.has(invitee.email)) {
      skipped.push({ email: invitee.email, reason: "listed twice" });
      continue;
    }
    seen.add(invitee.email);
    if (enrolledEmails.has(invitee.email)) {
      // Inviting again resends the invitation to someone who hasn't signed in yet, so an email
      // that couldn't be sent, or got lost, can be sent again.
      const { data: id } = await ctx.admin.rpc("user_id_by_email", { p_email: invitee.email });
      const { data: account } = id ? await ctx.admin.auth.admin.getUserById(id) : { data: null };
      if (account?.user && !account.user.last_sign_in_at) {
        if (await sendLink(invitee.email)) resent.push(invitee.email);
        else unsent.push(invitee.email);
      } else skipped.push({ email: invitee.email, reason: "already enrolled" });
      continue;
    }

    // Creating an account needs the secret key, which stays in lib/server.
    let userId: string | null = null;
    const { data: found } = await ctx.admin.rpc("user_id_by_email", { p_email: invitee.email });
    if (found) userId = found;
    else {
      const created = await ctx.admin.auth.admin.createUser({
        email: invitee.email,
        email_confirm: true,
        user_metadata: { full_name: invitee.name },
      });
      if (created.error || !created.data.user) throw new Error(`create account: ${created.error?.message}`);
      userId = created.data.user.id;
    }

    const { error } = await ctx.db.from("enrollments").insert({
      organization_id: course.organization_id,
      course_id: course.id,
      user_id: userId,
      display_name: invitee.name,
      email: invitee.email,
    });
    if (error) {
      if (error.code === "23505") {
        skipped.push({ email: invitee.email, reason: "already enrolled" });
        continue;
      }
      throw new Error(`enroll: ${error.message}`);
    }
    if (!(await sendLink(invitee.email))) unsent.push(invitee.email);
    enrolled.push(invitee);
  }
  return { enrolled, skipped, invalid, resent, unsent };
}
