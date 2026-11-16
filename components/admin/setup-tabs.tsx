"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/** The course setup's tabs, with the current one marked. */
export function SetupTabs({ tabs }: { tabs: Array<{ href: string; label: string; match: string[] }> }) {
  const path = usePathname();
  const current = (t: { href: string; match: string[] }) =>
    t.match.some((m) => (m === t.href ? path === m : path === m || path.startsWith(`${m}/`)));
  return (
    <nav aria-label="Course setup" className="mb-6 flex flex-wrap gap-1 border-b border-border text-sm">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={current(t) ? "page" : undefined}
          className={cx(
            "-mb-px border-b-2 px-3 py-2 no-underline",
            current(t) ? "border-primary font-medium text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
