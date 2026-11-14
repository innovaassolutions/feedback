import { requireCourse } from "@/lib/course";
import { createUserClient } from "@/lib/supabase/server";
import { DEFAULT_SESSION_GUIDE, guidePartSchema } from "@/lib/guide";
import { PageTitle } from "@/components/ui";
import { GuideForm } from "@/components/admin/guide-form";

export default async function GuidePage({ params }: PageProps<"/[org]/[course]/admin/guide">) {
  const { org, course } = await params;
  const ctx = await requireCourse(org, course);
  const db = await createUserClient();
  const { data } = await db.from("guides").select("rating_items, topics, version").eq("course_id", ctx.course.id).maybeSingle();
  const parsed = guidePartSchema.safeParse({ rating_items: data?.rating_items, topics: data?.topics });
  return (
    <>
      <PageTitle title="Interview guide" subtitle={`Version ${data?.version ?? 1}. The Interviewer asks the ratings first, then the topics.`} />
      <GuideForm courseId={ctx.course.id} guide={parsed.success ? parsed.data : DEFAULT_SESSION_GUIDE} />
    </>
  );
}
