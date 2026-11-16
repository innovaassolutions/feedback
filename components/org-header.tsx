import Link from "next/link";
import { logoUrl } from "@/lib/env";

export type NavItem = { href: string; label: string };

export function OrgHeader({
  orgSlug,
  orgName,
  logoPath,
  nav = [],
  email,
}: {
  orgSlug: string;
  orgName: string;
  logoPath: string | null;
  nav?: NavItem[];
  email?: string | null;
}) {
  const logo = logoUrl(logoPath);
  return (
    <header data-testid="org-header" className="no-print bg-primary text-on-primary">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        {/* A logo already shows the name, so the name appears as text only when there is no logo. */}
        <Link href={`/${orgSlug}`} className="flex items-center gap-3 text-on-primary no-underline">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={orgName} data-testid="org-logo" className="h-8 w-auto rounded-sm bg-surface p-0.5" />
          ) : (
            <span className="font-heading text-lg font-semibold">{orgName}</span>
          )}
        </Link>
        <nav aria-label="Main" className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:w-auto sm:flex-1">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-on-primary underline-offset-4 hover:underline">
              {item.label}
            </Link>
          ))}
          <Link href="/docs" className="text-on-primary underline-offset-4 hover:underline sm:ml-auto">
            Help
          </Link>
        </nav>
        {email ? (
          <form action="/auth/sign-out" method="post" className="flex items-center gap-3 text-sm">
            <span className="opacity-90">{email}</span>
            <button type="submit" className="rounded-theme border border-current px-3 py-1 text-on-primary">
              Sign out
            </button>
          </form>
        ) : null}
      </div>
    </header>
  );
}
