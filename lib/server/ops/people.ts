import { createClient } from "@supabase/supabase-js";
import type { OperationInput } from "@/lib/operations";
import { signInRedirect } from "@/lib/auth";
import type { Ctx } from "@/lib/server/ctx";
import { requireUser } from "@/lib/server/ctx";
import { conflict, forbidden, notFound, unprocessable } from "@/lib/server/http";

// People with a role beyond learner. Organization admins (and platform admins) add organization
// admins, instructors and sponsors; platform admins add other platform admins. Each new person gets
// an account if they have none, and a sign-in link by email.

type Account = { id: string; created: boolean };

/** Finds the account for an address, or creates one. Creating accounts needs the secret key. */
async function accountFor(ctx: Ctx, email: string, name: string, appMetadata?: Record<string, unknown>): Promise<Account> {
  const { data: found, error } = await ctx.admin.rpc("user_id_by_email", { p_email: email });
  if (error) throw new Error(`user lookup: ${error.message}`);
  if (found) return { id: found, created: false };
  const created = await ctx.admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name }, app_metadata: appMetadata });
  if (created.error || !created.data.user) throw new Error(`create account: ${created.error?.message}`);
  return { id: created.data.user.id, created: true };
}

/**
 * Sends a sign-in link that opens `path`. Auth hands it to the app, which sends it in the
 * organization's branding. Returns false when Auth won't send one yet, such as a second link to
 * the same address within a minute.
 */
async function sendSignInLink(ctx: Ctx, email: string, path: string): Promise<boolean> {
  const mail = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await mail.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: signInRedirect(ctx.origin, path) } });
  if (error) console.error(`[people] sign-in link not sent: ${error.name}`);
  return !error;
}

function isPlatformAdmin(ctx: Ctx): boolean {
  return ctx.user?.app_metadata?.platform_admin === true;
}

async function requireOrgAdmin(ctx: Ctx, organizationId: string) {
  requireUser(ctx);
  const { data } = await ctx.db.rpc("is_org_admin", { org: organizationId });
  if (data !== true) throw forbidden("Only the organization's admins can manage its people");
}

export async function addStaff(ctx: Ctx, input: OperationInput<"add_staff">) {
  await requireOrgAdmin(ctx, input.organization_id);
  const { data: org } = await ctx.db.from("organizations").select("id, slug, name").eq("id", input.organization_id).maybeSingle();
  if (!org) throw notFound("Organization not found");

  let course: { id: string; slug: string; title: string } | null = null;
  if (input.role === "org_admin") {
    if (input.course_id) throw unprocessable("An organization admin covers every course, so don't choose one");
  } else {
    if (!input.course_id) throw unprocessable("Choose the course this person is an instructor or sponsor for");
    const { data } = await ctx.db.from("courses").select("id, slug, title").eq("id", input.course_id).eq("organization_id", org.id).maybeSingle();
    if (!data) throw notFound("Course not found");
    course = data;
  }

  const account = await accountFor(ctx, input.email, input.name);
  const { data: membership, error } = await ctx.db
    .from("memberships")
    .insert({ organization_id: org.id, user_id: account.id, role: input.role, course_id: course?.id ?? null, display_name: input.name, email: input.email })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw conflict(`${input.email} already has this role`);
    throw new Error(`add membership: ${error.message}`);
  }
  const emailed = await sendSignInLink(ctx, input.email, course ? `/${org.slug}/${course.slug}` : `/${org.slug}`);
  return { membership_id: membership.id, account_created: account.created, emailed };
}

export async function removeStaff(ctx: Ctx, input: OperationInput<"remove_staff">) {
  const user = requireUser(ctx);
  // Read through Row Level Security: a role in another organization is "not found".
  const { data: m } = await ctx.db.from("memberships").select("id, organization_id, user_id, role").eq("id", input.membership_id).maybeSingle();
  if (!m) throw notFound("That role wasn't found");
  await requireOrgAdmin(ctx, m.organization_id);
  if (m.role === "org_admin" && m.user_id === user.id && !isPlatformAdmin(ctx)) {
    throw conflict("You can't remove your own admin role. Ask another admin of the organization.");
  }
  const { error } = await ctx.db.from("memberships").delete().eq("id", m.id);
  if (error) throw new Error(`remove membership: ${error.message}`);
  return { ok: true };
}

function requirePlatformAdmin(ctx: Ctx) {
  requireUser(ctx);
  if (!isPlatformAdmin(ctx)) throw forbidden("Only platform admins can manage platform admins");
}

export async function addPlatformAdmin(ctx: Ctx, input: OperationInput<"add_platform_admin">) {
  requirePlatformAdmin(ctx);
  const account = await accountFor(ctx, input.email, input.name, { platform_admin: true });
  if (!account.created) {
    const { data } = await ctx.admin.auth.admin.getUserById(account.id);
    if (data.user?.app_metadata?.platform_admin === true) throw conflict(`${input.email} is already a platform admin`);
    const { error } = await ctx.admin.auth.admin.updateUserById(account.id, {
      app_metadata: { ...(data.user?.app_metadata ?? {}), platform_admin: true },
    });
    if (error) throw new Error(`make platform admin: ${error.message}`);
  }
  const emailed = await sendSignInLink(ctx, input.email, "/platform");
  return { user_id: account.id, account_created: account.created, emailed };
}

export async function removePlatformAdmin(ctx: Ctx, input: OperationInput<"remove_platform_admin">) {
  const user = requireUser(ctx);
  requirePlatformAdmin(ctx);
  if (input.user_id === user.id) throw conflict("You can't remove your own platform admin access. Ask another platform admin.");
  const { data } = await ctx.admin.auth.admin.getUserById(input.user_id);
  if (!data.user || data.user.app_metadata?.platform_admin !== true) throw notFound("That platform admin wasn't found");
  const { error } = await ctx.admin.auth.admin.updateUserById(input.user_id, {
    app_metadata: { ...data.user.app_metadata, platform_admin: false },
  });
  if (error) throw new Error(`remove platform admin: ${error.message}`);
  return { ok: true };
}

/** Everyone with platform admin access, for the platform page. The caller checks the viewer first. */
export async function listPlatformAdmins(ctx: Ctx) {
  requirePlatformAdmin(ctx);
  const { data, error } = await ctx.admin.rpc("platform_admins");
  if (error) throw new Error(`platform admins: ${error.message}`);
  return data ?? [];
}

const TOO_SOON = "An email went to this address less than a minute ago. Wait a minute, then send it again.";

/** Emails a learner again: their invitation if they've never signed in, otherwise a sign-in email. */
export async function resendInvitation(ctx: Ctx, input: OperationInput<"resend_invitation">) {
  requireUser(ctx);
  const { data: row } = await ctx.db
    .from("enrollments")
    .select("id, email, course_id, courses!inner(slug, organizations!inner(slug))")
    .eq("id", input.enrollment_id)
    .maybeSingle();
  if (!row) throw notFound("Learner not found");
  const { data: manages } = await ctx.db.rpc("can_manage_course", { course: row.course_id });
  if (manages !== true) throw forbidden("Only the course's instructors and admins can do this");
  if (!(await sendSignInLink(ctx, row.email, `/${row.courses.organizations.slug}/${row.courses.slug}`))) throw conflict(TOO_SOON);
  return { sent: true };
}

/** Emails an admin, instructor or sponsor again, opening their course or organization. */
export async function resendStaffInvitation(ctx: Ctx, input: OperationInput<"resend_staff_invitation">) {
  requireUser(ctx);
  const { data: m } = await ctx.db
    .from("memberships")
    .select("id, email, organization_id, course_id, organizations!inner(slug), courses(slug)")
    .eq("id", input.membership_id)
    .maybeSingle();
  if (!m) throw notFound("That person wasn't found");
  await requireOrgAdmin(ctx, m.organization_id);
  const path = m.courses ? `/${m.organizations.slug}/${m.courses.slug}` : `/${m.organizations.slug}`;
  if (!(await sendSignInLink(ctx, m.email, path))) throw conflict(TOO_SOON);
  return { sent: true };
}
