"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { formatDate } from "@/lib/labels";
import { Badge, Button, Field, Notice, inputClass } from "@/components/ui";
import { ActionButton, DeleteButton } from "@/components/admin/edit-forms";

type Source = { id: string; url: string; status: "processing" | "ready" | "failed"; page_count: number; error: string | null; last_read_at: string | null };

/** "docs.example.com/guide" becomes "https://docs.example.com/guide"; anything unreadable is left for the server to refuse. */
export function normalizeSiteAddress(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`;
}

export function DocumentationForm({ organizationId, sources }: { organizationId: string; sources: Source[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reading = sources.some((s) => s.status === "processing");
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [reading, router]);

  async function add(form: FormData) {
    setError(null);
    const url = normalizeSiteAddress(String(form.get("url") ?? ""));
    if (!url) return setError("Enter the documentation site's address, such as docs.example.com.");
    setBusy(true);
    const res = await api("POST", `/api/organizations/${organizationId}/documentation`, { url });
    setBusy(false);
    if (!res.ok) {
      return setError(res.status === 422 ? `“${url}” isn't a web address the platform can read. Enter one such as https://docs.example.com/.` : res.error);
    }
    (document.getElementById("documentation-form") as HTMLFormElement | null)?.reset();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border" data-testid="documentation-sources">
        {sources.map((s) => (
          <li key={s.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="break-all font-medium">{s.url}</span>
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={s.status === "ready" ? "success" : s.status === "failed" ? "danger" : "neutral"}>
                  {s.status === "processing" ? "Reading…" : s.status === "ready" ? "Ready" : "Couldn't read"}
                </Badge>
                {s.status !== "processing" ? <ActionButton path={`/api/documentation/${s.id}/refresh`} label="Read again" done="Reading…" /> : null}
                <DeleteButton path={`/api/documentation/${s.id}`} what={s.url} label="Remove" />
              </span>
            </div>
            <p className={s.status === "failed" ? "mt-1 text-sm text-danger" : "mt-1 text-sm text-muted"} role={s.status === "failed" ? "alert" : undefined}>
              {s.status === "processing"
                ? "Reading the site’s pages. This can take a few minutes; this page updates by itself."
                : s.status === "failed"
                  ? (s.error ?? "The site couldn't be read.") + " Check the address opens in a browser, then choose Read again."
                  : `${s.page_count} ${s.page_count === 1 ? "page" : "pages"} read${s.last_read_at ? ` on ${formatDate(s.last_read_at)}` : ""}. It's read again every week.`}
            </p>
          </li>
        ))}
        {sources.length === 0 ? (
          <li className="py-3 text-sm text-muted">
            None yet. This is optional: without it, the Librarian answers from each session&apos;s documents only.
          </li>
        ) : null}
      </ul>
      <form id="documentation-form" action={add} className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Field label="Documentation site" hint="The address of the product's public help or documentation pages, such as docs.streamspace.ai">
            <input name="url" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} required placeholder="docs.example.com" className={inputClass} />
          </Field>
        </div>
        <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add documentation"}</Button>
      </form>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
