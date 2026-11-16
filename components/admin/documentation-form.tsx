"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Badge, Button, Field, Notice, inputClass } from "@/components/ui";
import { ActionButton, DeleteButton } from "@/components/admin/edit-forms";

type Source = { id: string; url: string; status: "processing" | "ready" | "failed"; page_count: number; error: string | null; last_read_at: string | null };

export function DocumentationForm({ organizationId, sources }: { organizationId: string; sources: Source[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const reading = sources.some((s) => s.status === "processing");
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [reading, router]);
  async function add(form: FormData) {
    setError(null);
    const res = await api("POST", `/api/organizations/${organizationId}/documentation`, { url: String(form.get("url") ?? "") });
    if (!res.ok) return setError(res.error);
    router.refresh();
  }
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border" data-testid="documentation-sources">
        {sources.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="break-all">{s.url}</span>
            <span className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {s.page_count} pages
              <Badge tone={s.status === "ready" ? "success" : s.status === "failed" ? "danger" : "neutral"}>{s.status === "processing" ? "Reading…" : s.status === "ready" ? "Ready" : "Failed"}</Badge>
              {s.status !== "processing" ? <ActionButton path={`/api/documentation/${s.id}/refresh`} label="Read again" done="Reading…" /> : null}
              <DeleteButton path={`/api/documentation/${s.id}`} what={s.url} label="Remove" />
            </span>
          </li>
        ))}
      </ul>
      <form action={add} className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Field label="Documentation site" hint="Pages under this address are read, and re-read every week">
            <input name="url" type="url" required placeholder="https://docs.example.com/" className={inputClass} />
          </Field>
        </div>
        <Button type="submit">Add documentation</Button>
      </form>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
