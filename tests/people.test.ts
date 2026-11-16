import { beforeAll, describe, expect, it } from "vitest";
import { addPlatformAdmin, addStaff, listPlatformAdmins, removePlatformAdmin, removeStaff } from "@/lib/server/ops/people";
import { parseSlug, suggestSlug } from "@/lib/slug";
import { admin, seeded, sql, userId } from "./support/db";
import { ctxAs, statusOf, type TestCtx } from "./support/ctx";

async function inbox(address: string, since: Date): Promise<Array<{ Subject: string }>> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${process.env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
    const body = (await res.json()) as { messages: Array<{ Created: string; Subject: string }> };
    const found = body.messages.filter((m) => new Date(m.Created) >= new Date(since.getTime() - 2000));
    if (found.length) return found;
    await new Promise((r) => setTimeout(r, 250));
  }
  return [];
}

describe("an organization's people", () => {
  let ids: Awaited<ReturnType<typeof seeded>>;
  let dana: TestCtx;
  const stamp = Date.now();

  beforeAll(async () => {
    ids = await seeded();
    dana = await ctxAs("dana");
  });

  it("an organization admin adds an instructor, who gets an account and an invitation by email", async () => {
    const email = `new.instructor.${stamp}@staff.example`;
    const since = new Date();
    const result = await addStaff(dana, { organization_id: ids.streamspace, name: "Robin Hale", email, role: "instructor", course_id: ids.ime });
    expect(result).toMatchObject({ account_created: true, emailed: true });
    const [row] = await sql()`select role, course_id, display_name from public.memberships where id = ${result.membership_id}`;
    expect(row).toMatchObject({ role: "instructor", course_id: ids.ime, display_name: "Robin Hale" });
    const messages = await inbox(email, since);
    expect(messages.map((m) => m.Subject)).toContain("You've been added to Streamspace platform training: IME Engineering as an instructor");
    // The same role twice is refused.
    expect(await statusOf(addStaff(dana, { organization_id: ids.streamspace, name: "Robin Hale", email, role: "instructor", course_id: ids.ime }))).toBe(409);
  });

  it("adds sponsors and organization admins, each with the right course or none", async () => {
    const sponsor = await addStaff(dana, { organization_id: ids.streamspace, name: "Exec One", email: `exec.${stamp}@staff.example`, role: "sponsor", course_id: ids.ime });
    expect(sponsor.account_created).toBe(true);
    const orgAdmin = await addStaff(dana, { organization_id: ids.streamspace, name: "Admin Two", email: `admin2.${stamp}@staff.example`, role: "org_admin", course_id: null });
    const [row] = await sql()`select role, course_id from public.memberships where id = ${orgAdmin.membership_id}`;
    expect(row).toEqual({ role: "org_admin", course_id: null });
    expect(await statusOf(addStaff(dana, { organization_id: ids.streamspace, name: "X", email: `x.${stamp}@staff.example`, role: "org_admin", course_id: ids.ime }))).toBe(422);
    expect(await statusOf(addStaff(dana, { organization_id: ids.streamspace, name: "X", email: `x.${stamp}@staff.example`, role: "sponsor", course_id: null }))).toBe(422);
  });

  it("gives an existing account a role without making a second one", async () => {
    const learnerId = await userId("ben");
    const result = await addStaff(dana, { organization_id: ids.streamspace, name: "Ben Carter", email: "ben.carter@ime-engineering.example", role: "sponsor", course_id: ids.ime });
    expect(result.account_created).toBe(false);
    const [row] = await sql()`select user_id from public.memberships where id = ${result.membership_id}`;
    expect(row.user_id).toBe(learnerId);
    await removeStaff(dana, { membership_id: result.membership_id });
  });

  it("keeps each organization's people to itself", async () => {
    const marcus = await ctxAs("marcus");
    const owen = await ctxAs("owen");
    const email = `cross.${stamp}@staff.example`;
    // An instructor isn't an organization admin.
    expect(await statusOf(addStaff(marcus, { organization_id: ids.streamspace, name: "X", email, role: "sponsor", course_id: ids.ime }))).toBe(403);
    // Another organization's admin can't add people here, or attach a role to another organization's course.
    expect(await statusOf(addStaff(owen, { organization_id: ids.streamspace, name: "X", email, role: "sponsor", course_id: ids.ime }))).toBe(403);
    expect(await statusOf(addStaff(dana, { organization_id: ids.streamspace, name: "X", email, role: "sponsor", course_id: ids.nwCourse }))).toBe(404);
    // The database refuses it too, whatever the page does.
    const danaId = await userId("dana");
    const { error } = await dana.db
      .from("memberships")
      .insert({ organization_id: ids.streamspace, user_id: danaId, role: "sponsor", course_id: ids.nwCourse, display_name: "Dana", email: "dana@x.example" });
    expect(error).not.toBeNull();
    // Another organization's roles look like they don't exist.
    const [owenRole] = await sql()`select id from public.memberships where organization_id = ${ids.northwind} limit 1`;
    expect(await statusOf(removeStaff(dana, { membership_id: owenRole.id as string }))).toBe(404);
  });

  it("removes a role, but not an admin's own admin role", async () => {
    const added = await addStaff(dana, { organization_id: ids.streamspace, name: "Temp Sponsor", email: `temp.${stamp}@staff.example`, role: "sponsor", course_id: ids.ime });
    await removeStaff(dana, { membership_id: added.membership_id });
    expect(await sql()`select id from public.memberships where id = ${added.membership_id}`).toHaveLength(0);
    const [own] = await sql()`select id from public.memberships where user_id = ${await userId("dana")} and role = 'org_admin'`;
    expect(await statusOf(removeStaff(dana, { membership_id: own.id as string }))).toBe(409);
  });
});

describe("platform admins", () => {
  const stamp = Date.now();

  it("a platform admin adds and removes another; nobody else can, and nobody removes themselves", async () => {
    const sam = await ctxAs("platformAdmin");
    const email = `platform.${stamp}@staff.example`;
    const added = await addPlatformAdmin(sam, { name: "Pat Platform", email });
    expect(added.account_created).toBe(true);
    const { data } = await admin().auth.admin.getUserById(added.user_id);
    expect(data.user?.app_metadata?.platform_admin).toBe(true);
    expect((await listPlatformAdmins(sam)).map((a) => a.email)).toContain(email);
    expect(await statusOf(addPlatformAdmin(sam, { name: "Pat Platform", email }))).toBe(409);

    const dana = await ctxAs("dana");
    expect(await statusOf(addPlatformAdmin(dana, { name: "X", email: `x.${stamp}@staff.example` }))).toBe(403);
    expect(await statusOf(listPlatformAdmins(dana))).toBe(403);
    expect(await statusOf(removePlatformAdmin(sam, { user_id: await userId("platformAdmin") }))).toBe(409);

    await removePlatformAdmin(sam, { user_id: added.user_id });
    const after = await admin().auth.admin.getUserById(added.user_id);
    expect(after.data.user?.app_metadata?.platform_admin).toBe(false);
    expect((await listPlatformAdmins(sam)).map((a) => a.email)).not.toContain(email);
  });
});

describe("web addresses", () => {
  it("accept short names and explain what to enter instead of a website", () => {
    expect(parseSlug("Streamspace")).toEqual({ ok: true, slug: "streamspace" });
    expect(parseSlug("www.streamspace.ai")).toEqual({ ok: false, message: "That's a website address. Enter a short name instead.", suggestion: "streamspace" });
    expect(parseSlug("https://feedback.innovaas.co/streamspace")).toMatchObject({ ok: false, suggestion: "streamspace" });
    expect(parseSlug("Stream Space")).toMatchObject({ ok: false, message: "Use 3 to 50 lowercase letters, numbers and hyphens.", suggestion: "stream-space" });
    expect(parseSlug("admin")).toMatchObject({ ok: false, suggestion: null });
    expect(parseSlug("")).toMatchObject({ ok: false });
    expect(suggestSlug("Northwind Academy")).toBe("northwind-academy");
    expect(suggestSlug("IME Engineering")).toBe("ime-engineering");
  });
});
