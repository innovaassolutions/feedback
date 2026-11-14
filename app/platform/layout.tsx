import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/platform");
  if (!isPlatformAdmin(user)) notFound();
  return (
    <>
      <header className="bg-primary text-on-primary">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-4 py-3">
          <Link href="/platform" className="font-semibold text-on-primary">Platform</Link>
          <nav aria-label="Platform" className="flex gap-4 text-sm">
            <Link href="/platform" className="text-on-primary">Organizations</Link>
            <Link href="/platform/quality" className="text-on-primary">Agent quality</Link>
          </nav>
          <span className="ml-auto text-sm">{user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
