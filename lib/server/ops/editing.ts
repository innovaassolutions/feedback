import type { Ctx } from "@/lib/server/ctx";
import { requireUser } from "@/lib/server/ctx";
import type { OperationInput } from "@/lib/operations";
import { conflict, forbidden, notFound, unprocessable } from "@/lib/server/http";
import { enqueue } from "@/lib/server/jobs/queue";
import { parseSlug, slugErrorMessage } from "@/lib/slug";
import { courseForUser, kickJobs, requireManage, sessionForUser } from "./common";

// Changing and removing what admins and instructors create. Learner feedback is never removed
// here: a course or session with interviews (or, for a session, questions) can't be deleted, and
// the database refuses it too.

async function isOrgAdmin(ctx: Ctx, organizationId: string): Promise<boolean> {
  const { data } = await ctx.db.rpc("is_org_admin", { org: organizationId });
  return data === true;
}

async function requireOrgAdmin(ctx: Ctx, organizationId: string, what: string) {
  requireUser(ctx);
  if (!(await isOrgAdmin(ctx, organizationId))) throw forbidden(`Only the organization's admins can ${what}`);
}

function checkedSlug(raw: string): string {
  const slug = parseSlug(raw);
  if (!slug.ok) throw unprocessable(slugErrorMessage(slug));
  return slug.slug;
}

/** Removes stored files for documents about to be deleted with their session or course. */
async function removeStoredDocuments(ctx: Ctx, filter: { course_id?: string; session_id?: string }) {
  let query = ctx.db.from("documents").select("storage_path");
  if (filter.course_id) query = query.eq("course_id", filter.course_id);
  if (filter.session_id) query = query.eq("session_id", filter.session_id);
  const { data } = await query;
  const paths = (data ?? []).map((d) => d.storage_path);
  if (paths.length) await ctx.db.storage.from("documents").remove(paths);
}

export async function updateOrganization(ctx: Ctx, input: OperationInput<"update_organization">) {
  await requireOrgAdmin(ctx, input.organization_id, "rename the organization");
  const slug = checkedSlug(input.slug);
  const { data, error } = await ctx.db.from("organizations").update({ name: input.name, slug }).eq("id", input.organization_id).select("id, name, slug").maybeSingle();
  if (error?.code === "23505") throw conflict("That web address is already taken. Choose another.");
  if (error) throw new Error(`update organization: ${error.message}`);
  if (!data) throw notFound("Organization not found");
  return { organization: data };
}

export async function updateCourse(ctx: Ctx, input: OperationInput<"update_course">) {
  const course = await courseForUser(ctx, input.course_id);
  await requireManage(ctx, course.id);
  const slug = checkedSlug(input.slug);
  // Links, QR codes and emails use the address, so only an organization admin changes it.
  if (slug !== course.slug && !(await isOrgAdmin(ctx, course.organization_id))) {
    throw forbidden("Only the organization's admins can change a course's web address");
  }
  const { data, error } = await ctx.db
    .from("courses")
    .update({
      title: input.title,
      slug,
      feedback_window_days: input.feedback_window_days,
      follow_up_days: input.follow_up_days,
      retention_days: input.retention_days,
      max_turns: input.max_turns,
      max_minutes: input.max_minutes,
    })
    .eq("id", course.id)
    .select("id, slug, title")
    .maybeSingle();
  if (error?.code === "23505") throw conflict("Another course in this organization already uses that web address.");
  if (error) throw new Error(`update course: ${error.message}`);
  if (!data) throw forbidden("You can't change this course");
  return { course: data };
}

export async function deleteCourse(ctx: Ctx, input: OperationInput<"delete_course">) {
  const course = await courseForUser(ctx, input.course_id);
  await requireOrgAdmin(ctx, course.organization_id, "delete a course");
  const { count } = await ctx.admin.from("interviews").select("id", { count: "exact", head: true }).eq("course_id", course.id);
  if (count) throw conflict("This course has learner feedback, so it can't be deleted. Rename it instead, or ask the platform team.");
  await removeStoredDocuments(ctx, { course_id: course.id });
  const { data, error } = await ctx.db.from("courses").delete().eq("id", course.id).select("id");
  if (error) throw new Error(`delete course: ${error.message}`);
  if (!data?.length) throw conflict("The course couldn't be deleted.");
  return { deleted: course.id, organization_slug: course.organizations.slug };
}

export async function updateSession(ctx: Ctx, input: OperationInput<"update_session">) {
  const session = await sessionForUser(ctx, input.session_id);
  await requireManage(ctx, session.course_id);
  const { data, error } = await ctx.db
    .from("sessions")
    .update({ number: input.number, title: input.title, date: input.date, objectives: input.objectives })
    .eq("id", session.id)
    .select("id, number, title, date, objectives")
    .maybeSingle();
  if (error?.code === "23505") throw conflict(`Another session in this course is already number ${input.number}.`);
  if (error) throw new Error(`update session: ${error.message}`);
  if (!data) throw forbidden("You can't change this session");
  return { session: data };
}

export async function deleteSession(ctx: Ctx, input: OperationInput<"delete_session">) {
  const session = await sessionForUser(ctx, input.session_id);
  await requireManage(ctx, session.course_id);
  const [{ count: interviews }, { count: questions }] = await Promise.all([
    ctx.admin.from("interviews").select("id", { count: "exact", head: true }).eq("session_id", session.id),
    ctx.admin.from("questions").select("id", { count: "exact", head: true }).eq("session_id", session.id),
  ]);
  if (interviews || questions) throw conflict("This session has learner feedback or questions, so it can't be deleted. Rename it instead.");
  await removeStoredDocuments(ctx, { session_id: session.id });
  const { data, error } = await ctx.db.from("sessions").delete().eq("id", session.id).select("id");
  if (error) throw new Error(`delete session: ${error.message}`);
  if (!data?.length) throw conflict("The session couldn't be deleted.");
  return { deleted: session.id };
}

export async function updateDocument(ctx: Ctx, input: OperationInput<"update_document">) {
  requireUser(ctx);
  const { data: doc } = await ctx.db.from("documents").select("id, course_id").eq("id", input.document_id).maybeSingle();
  if (!doc) throw notFound("Document not found");
  await requireManage(ctx, doc.course_id);
  const { data, error } = await ctx.db.from("documents").update({ title: input.title, audience: input.audience }).eq("id", doc.id).select("id, title, audience").single();
  if (error) throw new Error(`update document: ${error.message}`);
  // The Librarian's passages carry the document's title.
  await ctx.admin.from("document_chunks").update({ title: input.title }).eq("document_id", doc.id);
  return { document: data };
}

async function enrollmentForManager(ctx: Ctx, enrollmentId: string) {
  requireUser(ctx);
  const { data } = await ctx.db.from("enrollments").select("id, course_id").eq("id", enrollmentId).maybeSingle();
  if (!data) throw notFound("Learner not found");
  await requireManage(ctx, data.course_id);
  return data;
}

export async function updateEnrollment(ctx: Ctx, input: OperationInput<"update_enrollment">) {
  const row = await enrollmentForManager(ctx, input.enrollment_id);
  const { data, error } = await ctx.db.from("enrollments").update({ display_name: input.display_name }).eq("id", row.id).select("id, display_name").single();
  if (error) throw new Error(`update learner: ${error.message}`);
  return { enrollment: data };
}

/** Takes a learner off the course. Their account stays, and so does any feedback they gave. */
export async function removeEnrollment(ctx: Ctx, input: OperationInput<"remove_enrollment">) {
  const row = await enrollmentForManager(ctx, input.enrollment_id);
  const { error } = await ctx.db.from("enrollments").delete().eq("id", row.id);
  if (error) throw new Error(`remove learner: ${error.message}`);
  return { removed: row.id };
}

export async function updateStaff(ctx: Ctx, input: OperationInput<"update_staff">) {
  requireUser(ctx);
  const { data: m } = await ctx.db.from("memberships").select("id, organization_id, user_id").eq("id", input.membership_id).maybeSingle();
  if (!m) throw notFound("That person wasn't found");
  await requireOrgAdmin(ctx, m.organization_id, "rename people");
  // The same person's other roles in the organization take the new name too.
  const { error } = await ctx.db.from("memberships").update({ display_name: input.display_name }).eq("organization_id", m.organization_id).eq("user_id", m.user_id);
  if (error) throw new Error(`rename: ${error.message}`);
  return { ok: true };
}

async function sourceForAdmin(ctx: Ctx, sourceId: string) {
  requireUser(ctx);
  const { data } = await ctx.db.from("documentation_sources").select("id, organization_id").eq("id", sourceId).maybeSingle();
  if (!data) throw notFound("Documentation site not found");
  await requireOrgAdmin(ctx, data.organization_id, "manage product documentation");
  return data;
}

/** Removes a documentation site; its pages go with it, so the Librarian stops using them. */
export async function removeDocumentationSource(ctx: Ctx, input: OperationInput<"remove_documentation_source">) {
  const source = await sourceForAdmin(ctx, input.source_id);
  const { error } = await ctx.db.from("documentation_sources").delete().eq("id", source.id);
  if (error) throw new Error(`remove documentation: ${error.message}`);
  return { removed: source.id };
}

export async function refreshDocumentationSource(ctx: Ctx, input: OperationInput<"refresh_documentation_source">) {
  const source = await sourceForAdmin(ctx, input.source_id);
  await ctx.db.from("documentation_sources").update({ status: "processing", error: null }).eq("id", source.id);
  await enqueue(ctx.admin, { kind: "read_documentation", payload: { source_id: source.id }, organizationId: source.organization_id });
  kickJobs(ctx);
  return { ok: true };
}
