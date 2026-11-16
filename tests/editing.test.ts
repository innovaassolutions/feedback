import { beforeAll, describe, expect, it } from "vitest";
import {
  deleteCourse,
  deleteSession,
  refreshDocumentationSource,
  removeDocumentationSource,
  removeEnrollment,
  updateCourse,
  updateDocument,
  updateEnrollment,
  updateOrganization,
  updateSession,
  updateStaff,
} from "@/lib/server/ops/editing";
import { createSession } from "@/lib/server/ops/sessions";
import { admin, seeded, sql, userId } from "./support/db";
import { ctxAs, statusOf, type TestCtx } from "./support/ctx";

const stamp = Date.now().toString().slice(-7);
let ids: Awaited<ReturnType<typeof seeded>>;
let dana: TestCtx;
let marcus: TestCtx;
let owen: TestCtx;
let ben: TestCtx;

beforeAll(async () => {
  ids = await seeded();
  [dana, marcus, owen, ben] = await Promise.all([ctxAs("dana"), ctxAs("marcus"), ctxAs("owen"), ctxAs("ben")]);
});

async function newCourse(title: string) {
  const { data, error } = await admin().from("courses").insert({ organization_id: ids.streamspace, slug: `edit-${stamp}-${Math.floor(Math.random() * 1e6)}`, title }).select("id, slug").single();
  if (error) throw error;
  return data;
}

async function newSession(courseId: string, title: string) {
  const number = 60000 + Math.floor(Math.random() * 9000);
  const { data, error } = await admin()
    .from("sessions")
    .insert({ organization_id: ids.streamspace, course_id: courseId, number, title, date: "2026-12-15", state: "draft" })
    .select("id, number")
    .single();
  if (error) throw error;
  return data;
}

/** An interview in a session, the feedback that protects a course or session from deletion. */
async function addInterview(courseId: string, sessionId: string) {
  await sql()`insert into public.interviews (organization_id, course_id, session_id, token_hash) values (${ids.streamspace}, ${courseId}, ${sessionId}, ${crypto.randomUUID()})`;
}

const settings = { feedback_window_days: 7, follow_up_days: 30, retention_days: 365, max_turns: 14, max_minutes: 15 };

describe("courses", () => {
  it("an organization admin who isn't a platform admin can create a course and read it back", async () => {
    // The create course form inserts and reads the row back in one statement.
    const { data, error } = await dana.db.from("courses").insert({ organization_id: ids.streamspace, slug: `by-org-admin-${stamp}`, title: "Created by an organization admin" }).select("id").single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    // …and add its first session.
    const { session } = await createSession(dana, { course_id: data!.id, title: "Foundation", date: "2026-12-01", objectives: "" });
    expect(session).toMatchObject({ number: 1, title: "Foundation", state: "draft" });
    // Another organization's admin still can't.
    const { error: other } = await owen.db.from("courses").insert({ organization_id: ids.streamspace, slug: `not-mine-${stamp}`, title: "Not mine" }).select("id").single();
    expect(other).not.toBeNull();
  });

  it("an organization admin renames a course and changes its web address and settings", async () => {
    const course = await newCourse("Session 1 - Foundation");
    const slug = `foundation-${stamp}`;
    const { course: saved } = await updateCourse(dana, { course_id: course.id, title: "Foundation programme", slug, ...settings, feedback_window_days: 10 });
    expect(saved).toMatchObject({ title: "Foundation programme", slug });
    const [row] = await sql()`select feedback_window_days from public.courses where id = ${course.id}`;
    expect(row.feedback_window_days).toBe(10);
  });

  it("an instructor can rename their course but not change its web address", async () => {
    const [ime] = await sql()`select title, slug from public.courses where id = ${ids.ime}`;
    await updateCourse(marcus, { course_id: ids.ime, title: `${ime.title} (renamed)`, slug: ime.slug as string, ...settings });
    expect((await sql()`select title from public.courses where id = ${ids.ime}`)[0].title).toBe(`${ime.title} (renamed)`);
    await updateCourse(marcus, { course_id: ids.ime, title: ime.title as string, slug: ime.slug as string, ...settings });
    expect(await statusOf(updateCourse(marcus, { course_id: ids.ime, title: ime.title as string, slug: `moved-${stamp}`, ...settings }))).toBe(403);
  });

  it("refuses a web address that's taken, a website, or another organization's course", async () => {
    const course = await newCourse("Address checks");
    const [ime] = await sql()`select slug from public.courses where id = ${ids.ime}`;
    expect(await statusOf(updateCourse(dana, { course_id: course.id, title: "Address checks", slug: ime.slug as string, ...settings }))).toBe(409);
    expect(await statusOf(updateCourse(dana, { course_id: course.id, title: "Address checks", slug: "www.example.com", ...settings }))).toBe(422);
    expect(await statusOf(updateCourse(owen, { course_id: course.id, title: "Mine now", slug: course.slug, ...settings }))).toBe(404);
    expect(await statusOf(updateCourse(ben, { course_id: ids.ime, title: "A learner's title", slug: ime.slug as string, ...settings }))).toBe(403);
  });

  it("deletes a course with no feedback, with its sessions, and never one with feedback", async () => {
    const course = await newCourse("Created by mistake");
    await newSession(course.id, "Its only session");
    expect(await statusOf(deleteCourse(marcus, { course_id: course.id }))).toBe(404);
    await deleteCourse(dana, { course_id: course.id });
    expect(await sql()`select id from public.courses where id = ${course.id}`).toHaveLength(0);
    expect(await sql()`select id from public.sessions where course_id = ${course.id}`).toHaveLength(0);

    // A course with an interview: the operation refuses, and so does the database itself.
    const kept = await newCourse("Has feedback");
    const session = await newSession(kept.id, "Delivered");
    await addInterview(kept.id, session.id);
    expect(await statusOf(deleteCourse(dana, { course_id: kept.id }))).toBe(409);
    const { data } = await dana.db.from("courses").delete().eq("id", kept.id).select("id");
    expect(data).toEqual([]);
    expect(await sql()`select id from public.courses where id = ${kept.id}`).toHaveLength(1);
  });
});

describe("sessions", () => {
  it("an instructor renames, re-dates and renumbers a session; numbers stay unique", async () => {
    const s = await newSession(ids.ime, "Session 1 - Foundation");
    const { session } = await updateSession(marcus, { session_id: s.id, number: s.number + 1, title: "Foundations", date: "2026-12-20", objectives: "Know the basics." });
    expect(session).toMatchObject({ number: s.number + 1, title: "Foundations", date: "2026-12-20", objectives: "Know the basics." });
    expect(await statusOf(updateSession(marcus, { session_id: s.id, number: 1, title: "Foundations", date: "2026-12-20", objectives: "" }))).toBe(409);
    expect(await statusOf(updateSession(ben, { session_id: s.id, number: s.number + 1, title: "Mine", date: "2026-12-20", objectives: "" }))).toBe(404);
  });

  it("deletes a session with no interviews or questions, and refuses one that has them", async () => {
    const s = await newSession(ids.ime, "Added by mistake");
    await deleteSession(marcus, { session_id: s.id });
    expect(await sql()`select id from public.sessions where id = ${s.id}`).toHaveLength(0);
    const delivered = await newSession(ids.ime, "Delivered");
    await addInterview(ids.ime, delivered.id);
    expect(await statusOf(deleteSession(marcus, { session_id: delivered.id }))).toBe(409);
    const asked = await newSession(ids.ime, "Has a question");
    await sql()`insert into public.questions (organization_id, course_id, session_id, author_id, text) values (${ids.streamspace}, ${ids.ime}, ${asked.id}, ${await userId("ben")}, 'Where is the handout?')`;
    expect(await statusOf(deleteSession(marcus, { session_id: asked.id }))).toBe(409);
    const { data } = await marcus.db.from("sessions").delete().eq("id", asked.id).select("id");
    expect(data).toEqual([]);
  });
});

describe("documents, learners, people and documentation", () => {
  it("changes a document's title and who sees it, and the Librarian's passages follow the title", async () => {
    const s = await newSession(ids.ime, "Documents");
    const [doc] = await sql()`insert into public.documents (organization_id, course_id, session_id, title, audience, storage_path, file_name, mime_type, size_bytes, status)
      values (${ids.streamspace}, ${ids.ime}, ${s.id}, 'Old title', 'learners', ${`test/${crypto.randomUUID()}/a.md`}, 'a.md', 'text/markdown', 10, 'ready') returning id`;
    await sql()`insert into public.document_chunks (organization_id, course_id, session_id, source_kind, document_id, title, content, embedding)
      values (${ids.streamspace}, ${ids.ime}, ${s.id}, 'session_document', ${doc.id}, 'Old title', 'text', ${`[${Array(1536).fill(0.01).join(",")}]`}::extensions.vector)`;
    await updateDocument(marcus, { document_id: doc.id as string, title: "Session 3 recording transcript", audience: "agents_only" });
    const [row] = await sql()`select title, audience from public.documents where id = ${doc.id}`;
    expect(row).toEqual({ title: "Session 3 recording transcript", audience: "agents_only" });
    expect((await sql()`select title from public.document_chunks where document_id = ${doc.id}`)[0].title).toBe("Session 3 recording transcript");
    expect(await statusOf(updateDocument(ben, { document_id: doc.id as string, title: "x", audience: "learners" }))).toBe(404);
  });

  it("corrects a learner's name and removes a learner, keeping their account", async () => {
    const email = `roster.edit.${stamp}@learner.example`;
    const { data: user } = await admin().auth.admin.createUser({ email, email_confirm: true });
    const [row] = await sql()`insert into public.enrollments (organization_id, course_id, user_id, display_name, email) values (${ids.streamspace}, ${ids.ime}, ${user.user!.id}, 'Typo Nmae', ${email}) returning id`;
    await updateEnrollment(marcus, { enrollment_id: row.id as string, display_name: "Correct Name" });
    expect((await sql()`select display_name from public.enrollments where id = ${row.id}`)[0].display_name).toBe("Correct Name");
    expect(await statusOf(updateEnrollment(owen, { enrollment_id: row.id as string, display_name: "x" }))).toBe(404);
    await removeEnrollment(marcus, { enrollment_id: row.id as string });
    expect(await sql()`select id from public.enrollments where id = ${row.id}`).toHaveLength(0);
    expect((await admin().auth.admin.getUserById(user.user!.id)).data.user?.email).toBe(email);
  });

  it("an organization admin corrects a person's name across their roles", async () => {
    const marcusId = await userId("marcus");
    const [m] = await sql()`select id, display_name from public.memberships where user_id = ${marcusId} limit 1`;
    await updateStaff(dana, { membership_id: m.id as string, display_name: "Marcus Renamed" });
    const names = await sql()`select distinct display_name from public.memberships where user_id = ${marcusId}`;
    expect(names.map((n) => n.display_name)).toEqual(["Marcus Renamed"]);
    expect(await statusOf(updateStaff(marcus, { membership_id: m.id as string, display_name: "Me" }))).toBe(403);
    await updateStaff(dana, { membership_id: m.id as string, display_name: m.display_name as string });
  });

  it("reads a documentation site again, or removes it with its pages", async () => {
    const [source] = await sql()`insert into public.documentation_sources (organization_id, url, status, page_count) values (${ids.streamspace}, ${`https://docs.edit.example/${stamp}`}, 'ready', 3) returning id`;
    await refreshDocumentationSource(dana, { source_id: source.id as string });
    expect((await sql()`select status from public.documentation_sources where id = ${source.id}`)[0].status).toBe("processing");
    expect(await sql()`select id from public.jobs where kind = 'read_documentation' and payload ->> 'source_id' = ${source.id as string}`).not.toHaveLength(0);
    expect(await statusOf(removeDocumentationSource(owen, { source_id: source.id as string }))).toBe(404);
    // An instructor isn't an organization admin; the site is hidden from them or refused.
    expect([403, 404]).toContain(await statusOf(removeDocumentationSource(marcus, { source_id: source.id as string })));
    await removeDocumentationSource(dana, { source_id: source.id as string });
    expect(await sql()`select id from public.documentation_sources where id = ${source.id}`).toHaveLength(0);
  });
});

describe("organizations", () => {
  it("an organization admin renames the organization and changes its web address, within the rules", async () => {
    const sam = await ctxAs("platformAdmin");
    const { data: org } = await admin().from("organizations").insert({ name: "Temp Org", slug: `temp-${stamp}` }).select("id").single();
    const { organization } = await updateOrganization(sam, { organization_id: org!.id, name: "Renamed Org", slug: `renamed-${stamp}` });
    expect(organization).toMatchObject({ name: "Renamed Org", slug: `renamed-${stamp}` });
    expect(await statusOf(updateOrganization(sam, { organization_id: org!.id, name: "Renamed Org", slug: "streamspace" }))).toBe(409);
    expect(await statusOf(updateOrganization(sam, { organization_id: org!.id, name: "Renamed Org", slug: "admin" }))).toBe(422);
    expect(await statusOf(updateOrganization(owen, { organization_id: org!.id, name: "Mine", slug: `mine-${stamp}` }))).toBe(403);
  });
});

describe("the session brief", () => {
  it("can be drafted again from the session's read documents, and only by its managers", async () => {
    const { requestBriefDraft } = await import("@/lib/server/ops/sessions");
    const s = await newSession(ids.ime, "Brief again");
    expect(await statusOf(requestBriefDraft(marcus, { session_id: s.id }))).toBe(422);
    await sql()`insert into public.documents (organization_id, course_id, session_id, title, audience, storage_path, file_name, mime_type, size_bytes, status)
      values (${ids.streamspace}, ${ids.ime}, ${s.id}, 'Slides', 'learners', ${`test/${crypto.randomUUID()}/s.md`}, 's.md', 'text/markdown', 10, 'ready')`;
    expect(await requestBriefDraft(marcus, { session_id: s.id })).toEqual({ queued: true });
    expect(await sql()`select id from public.jobs where kind = 'draft_brief' and payload ->> 'session_id' = ${s.id}`).not.toHaveLength(0);
    expect(await statusOf(requestBriefDraft(ben, { session_id: s.id }))).toBe(404);
  });
});
