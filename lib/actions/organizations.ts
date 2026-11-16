"use server";
import { redirect } from "next/navigation";
import { requestCtx } from "@/lib/server/route";
import { storeLogo, proposeFromStoredLogo } from "@/lib/server/ops/themes";
import { HttpError } from "@/lib/server/http";
import { DEFAULT_FOLLOW_UP_GUIDE, DEFAULT_SESSION_GUIDE } from "@/lib/guide";
import { parseSlug, slugErrorMessage } from "@/lib/slug";

export type FormState = { status: "idle" | "error"; message: string };


/** A platform admin creates an organization with a name, an address and a logo. */
export async function createOrganization(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  const slug = parseSlug(form.get("slug"));
  const logo = form.get("logo");
  if (!name) return { status: "error", message: "Give the organization a name." };
  if (!slug.ok) return { status: "error", message: slugErrorMessage(slug) };
  if (!(logo instanceof File) || logo.size === 0) return { status: "error", message: "Add a logo (PNG or SVG)." };
  const ctx = await requestCtx();
  if (ctx.user?.app_metadata?.platform_admin !== true) return { status: "error", message: "Only the platform admin can create organizations." };
  const { data: org, error } = await ctx.db.from("organizations").insert({ name, slug: slug.slug }).select("id").single();
  if (error) return { status: "error", message: error.code === "23505" ? "That address is already taken." : "The organization couldn't be created." };
  try {
    const stored = await storeLogo(ctx, org.id, logo);
    await ctx.db.from("organizations").update({ logo_path: stored.path }).eq("id", org.id);
    await proposeFromStoredLogo(ctx, org.id, stored.path, stored.bytes);
  } catch (err) {
    if (err instanceof HttpError) return { status: "error", message: `Created ${name}, but: ${err.message}` };
    throw err;
  }
  redirect(`/${slug.slug}/settings/brand`);
}

/** An organization admin creates a course with the default interview guide. */
export async function createCourse(_prev: FormState, form: FormData): Promise<FormState> {
  const organizationId = String(form.get("organization_id") ?? "");
  const orgSlug = String(form.get("org_slug") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const slug = parseSlug(form.get("slug"));
  if (!title) return { status: "error", message: "Give the course a title." };
  if (!slug.ok) return { status: "error", message: slugErrorMessage(slug) };
  const ctx = await requestCtx();
  const { data: course, error } = await ctx.db
    .from("courses")
    .insert({ organization_id: organizationId, slug: slug.slug, title })
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
  redirect(`/${orgSlug}/${slug.slug}/admin`);
}
