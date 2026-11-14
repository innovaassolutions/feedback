import Link from "next/link";

export default function CoursePageNotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-muted">The page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <p className="mt-6">
        <Link href="..">Back to the course</Link>
      </p>
    </div>
  );
}
