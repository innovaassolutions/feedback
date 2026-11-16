import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";
import type { Tables } from "@/lib/database.types";

export type CourseRole = "learner" | "instructor" | "sponsor" | "org_admin" | "platform_admin";

export type CourseContext = {
  userId: string;
  email: string;
  displayName: string;
  org: Pick<Tables<"organizations">, "id" | "slug" | "name" | "logo_path">;
  course: Tables<"courses">;
  roles: Set<CourseRole>;
  can: {
    /** Sessions, documents, roster and guide. */
    manage: boolean;
    /** Aggregated results and actions. */
    readResults: boolean;
    /** Transcripts and quotes. */
    readTranscripts: boolean;
    /** Answer and verify questions, record actions. */
    instruct: boolean;
    answerQuestions: boolean;
    /** Give feedback, ask and vote. */
    learn: boolean;
  };
};

/**
 * The course as the signed-in user sees it, or null. Row Level Security decides what is
 * visible, so an unknown course and a course the user isn't part of look the same.
 */
export const loadCourse = cache(async (orgSlug: string, courseSlug: string): Promise<CourseContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = await createUserClient();

  const { data: org } = await db
    .from("organizations")
    .select("id, slug, name, logo_path")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (!org) return null;

  const { data: course } = await db
    .from("courses")
    .select("*")
    .eq("organization_id", org.id)
    .eq("slug", courseSlug)
    .maybeSingle();
  if (!course) return null;

  const [{ data: memberships }, { data: enrollment }] = await Promise.all([
    db.from("memberships").select("role, course_id, display_name").eq("user_id", user.id).eq("organization_id", org.id),
    db.from("enrollments").select("display_name").eq("user_id", user.id).eq("course_id", course.id).maybeSingle(),
  ]);

  const roles = new Set<CourseRole>();
  if (enrollment) roles.add("learner");
  for (const m of memberships ?? []) {
    if (m.role === "org_admin") roles.add("org_admin");
    else if (m.course_id === course.id) roles.add(m.role);
  }
  if (isPlatformAdmin(user)) roles.add("platform_admin");

  const displayName =
    enrollment?.display_name ?? memberships?.[0]?.display_name ?? (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "";

  return {
    userId: user.id,
    email: user.email ?? "",
    displayName,
    org,
    course,
    roles,
    can: {
      manage: roles.has("instructor") || roles.has("org_admin") || roles.has("platform_admin"),
      // Admins see results as instructors do (Todd's change to the plan's roles); sponsors see the aggregate.
      readResults: roles.has("instructor") || roles.has("sponsor") || roles.has("org_admin") || roles.has("platform_admin"),
      readTranscripts: roles.has("instructor") || roles.has("org_admin") || roles.has("platform_admin"),
      instruct: roles.has("instructor"),
      // Answering, verifying and removing on the Q&A board: instructors, and admins as they do.
      answerQuestions: roles.has("instructor") || roles.has("org_admin") || roles.has("platform_admin"),
      learn: roles.has("learner"),
    },
  };
});

/**
 * For pages: the course, or "Course not found". Pages render alongside their layout, so each one
 * checks for itself rather than relying on the layout having already stopped the request.
 */
export async function requireCourse(orgSlug: string, courseSlug: string): Promise<CourseContext> {
  const ctx = await loadCourse(orgSlug, courseSlug);
  if (!ctx) notFound();
  return ctx;
}
