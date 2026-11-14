import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-muted">The page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <p className="mt-6">
        <Link href="/">Go to your courses</Link>
      </p>
    </main>
  );
}
