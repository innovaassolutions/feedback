import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCourse } from "@/lib/course";

export default async function AdminLayout({ children, params }: LayoutProps<"/[org]/[course]/admin">) {
  const { org, course } = await params;
  const ctx = await requireCourse(org, course);
  if (!ctx.can.manage) notFound();
  const base = `/${org}/${course}/admin`;
  return (
    <div>
      <nav aria-label="Administration" className="mb-6 flex gap-4 border-b border-border pb-3 text-sm">
        <Link href={base}>Sessions</Link>
        <Link href={`${base}/roster`}>Roster</Link>
        <Link href={`${base}/guide`}>Interview guide</Link>
      </nav>
      {children}
    </div>
  );
}
