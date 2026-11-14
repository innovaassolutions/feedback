import "server-only";
import { createUserClient } from "@/lib/supabase/server";

export type MyCourse = { orgSlug: string; orgName: string; courseSlug: string; title: string };

/** Every course the signed-in user can see. */
export async function listMyCourses(): Promise<MyCourse[]> {
  const db = await createUserClient();
  const { data } = await db
    .from("courses")
    .select("slug, title, organizations!inner(slug, name)")
    .order("title");
  return (data ?? []).map((c) => ({
    orgSlug: c.organizations.slug,
    orgName: c.organizations.name,
    courseSlug: c.slug,
    title: c.title,
  }));
}
