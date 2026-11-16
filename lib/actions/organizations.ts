"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requestCtx } from "@/lib/server/route";
import { storeLogo, proposeFromStoredLogo } from "@/lib/server/ops/themes";
import { HttpError } from "@/lib/server/http";
import { DEFAULT_FOLLOW_UP_GUIDE, DEFAULT_SESSION_GUIDE } from "@/lib/guide";

export type FormState = { status: "idle" | "error"; message: string };

const RESERVED = new Set(["platform", "sign-in", "auth", "api", "settings", "admin", "dashboard", "docs", "_next", "static"]);
const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, "Use 3 to 50 lowercase letters, numbers and hyphens");

/** A platform admin creates an organization with a name, an address and a logo. */
export async function createOrganization(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  const slug = slugSchema.safeParse(form.get("slug"));
  const logo = form.get("logo");
  if (!name) return { status: "error", message: "Give the organization a name." };
  if (!slug.success) return { status: "error", message: `Address: ${slug.error.issues[0].message}.` };
  if (RESERVED.has(slug.data)) return { status: "error", message: "That address is reserved. Choose another." };
  if (!(logo instanceof File) || logo.size === 0) return { status: "error", message: "Add a logo (PNG or SVG)." };
  const ctx = await requestCtx();
  if (ctx.user?.app_metadata?.platform_admin !== true) return { status: "error", message: "Only the platform admin can create organizations." };
  const { data: org, error } = await ctx.db.from("organizations").insert({ name, slug: slug.data }).select("id").single();
  if (error) return { status: "error", message: error.code === "23505" ? "That address is already taken." : "The organization couldn't be created." };
  try {
    const stored = await storeLogo(ctx, org.id, logo);
    await ctx.db.from("organizations").update({ logo_path: stored.path }).eq("id", org.id);
    await proposeFromStoredLogo(ctx, org.id, stored.path, stored.bytes);
  } catch (err) {
    if (err instanceof HttpError) return { status: "error", message: `Created ${name}, but: ${err.message}` };
    throw err;
  }
  redirect(`/${slug.data}/settings/brand`);
}

/** An organization admin creates a course with the default interview guide. */
export async function createCourse(_prev: FormState, form: FormData): Promise<FormState> {
  const organizationId = String(form.get("organization_id") ?? "");
  const orgSlug = String(form.get("org_slug") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const slug = slugSchema.safeParse(form.get("slug"));
  if (!title) return { status: "error", message: "Give the course a title." };
  if (!slug.success) return { status: "error", message: `Address: ${slug.error.issues[0].message}.` };
  if (RESERVED.has(slug.data)) return { status: "error", message: "That address is reserved. Choose another." };
  const ctx = await requestCtx();
  const { data: course, error } = await ctx.db
    .from("courses")
    .insert({ organization_id: organizationId, slug: slug.data, title })
    .select("id")
    .single();
  if (error) return { status: "error", message: error.code === "23505" ? "That address is already used in this organization." : "The course couldn't be created." };
  await ctx.db.from("guides").insert({
    organization_id: organizationId,
    course_id: course.id,
    rating_items: DEFAULT_SESSION_GUIDE.rating_items,
    topics: DEFAULT_SESSION_GUIDE.topics,
    follow_up: DEFAULT_FOLLOW_UP_GUIDE,
  });
  redirect(`/${orgSlug}/${slug.data}/admin`);
}
