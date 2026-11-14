import Link from "next/link";

// Shown for an unknown course and for a course the signed-in user isn't part of. The two look
// the same on purpose.
export default function CourseNotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Course not found</h1>
      <p className="mt-2 text-muted">Check the address, or sign in with the email address you were invited with.</p>
      <p className="mt-6">
        <Link href="/">Go to your courses</Link>
      </p>
    </main>
  );
}
