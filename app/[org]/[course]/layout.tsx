import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadCourse } from "@/lib/course";
import { currentPath } from "@/lib/request";

/** Every course page needs a signed-in user who is part of the course. */
export default async function CourseLayout({ children, params }: LayoutProps<"/[org]/[course]">) {
  const { org, course } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/${org}/sign-in?next=${encodeURIComponent(await currentPath())}`);
  const ctx = await loadCourse(org, course);
  if (!ctx) notFound();
  return <>{children}</>;
}
