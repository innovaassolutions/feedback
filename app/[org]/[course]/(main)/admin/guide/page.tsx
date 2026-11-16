import { requireCourse } from "@/lib/course";
import { createUserClient } from "@/lib/supabase/server";
import { DEFAULT_SESSION_GUIDE, guidePartSchema } from "@/lib/guide";
import { PageTitle, Notice } from "@/components/ui";
import { GuideForm } from "@/components/admin/guide-form";

export default async function GuidePage({ params }: PageProps<"/[org]/[course]/admin/guide">) {
  const { org, course } = await params;
  const ctx = await requireCourse(org, course);
  const db = await createUserClient();
  const { data } = await db.from("guides").select("rating_items, topics, version").eq("course_id", ctx.course.id).maybeSingle();
  const parsed = guidePartSchema.safeParse({ rating_items: data?.rating_items, topics: data?.topics });
  // Unchanged from the standard guide every course starts with.
  const standard = !parsed.success || JSON.stringify(parsed.data) === JSON.stringify({ rating_items: DEFAULT_SESSION_GUIDE.rating_items, topics: DEFAULT_SESSION_GUIDE.topics });
  return (
    <>
      <PageTitle title="Interview guide" subtitle={`Version ${data?.version ?? 1}. The Interviewer asks the ratings first, then the topics.`} />
      <Notice tone="success">
        {standard
          ? "This course uses the standard interview guide, and it's ready to use. You don't need to write or change anything. Change a question or topic below only if this course needs something different; every session's interview uses it."
          : "This course's guide has been changed from the standard one. Every session's interview uses it."}
      </Notice>
      <div className="mb-6" />
      <GuideForm courseId={ctx.course.id} guide={parsed.success ? parsed.data : DEFAULT_SESSION_GUIDE} />
    </>
  );
}
