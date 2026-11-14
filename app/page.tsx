import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";
import { listMyCourses } from "@/lib/my-courses";
import { Card, LinkButton, PageTitle } from "@/components/ui";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-4 py-24">
        <h1 className="text-3xl font-semibold">Course Feedback Platform</h1>
        <p className="mt-3 text-muted">Session feedback, questions and results for your course.</p>
        <LinkButton href="/sign-in" className="mt-8">Sign in</LinkButton>
      </main>
    );
  }
  const courses = await listMyCourses();
  const admin = isPlatformAdmin(user);
  if (courses.length === 1 && !admin) redirect(`/${courses[0].orgSlug}/${courses[0].courseSlug}`);
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <PageTitle
        title="Your courses"
        subtitle={user.email}
        actions={
          <form action="/auth/sign-out" method="post">
            <button className="text-sm text-primary underline">Sign out</button>
          </form>
        }
      />
      {admin ? (
        <p className="mb-6">
          <Link href="/platform">Platform administration</Link>
        </p>
      ) : null}
      {courses.length === 0 ? (
        <Card>
          <p className="text-muted">You aren&apos;t part of any course yet. Your instructor will send you an invitation.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {courses.map((c) => (
            <li key={`${c.orgSlug}/${c.courseSlug}`}>
              <Card>
                <Link href={`/${c.orgSlug}/${c.courseSlug}`} className="text-lg font-medium">
                  {c.title}
                </Link>
                <p className="text-sm text-muted">{c.orgName}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
