"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Field, Notice, inputClass } from "@/components/ui";

export function NewSessionForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const res = await api("POST", `/api/courses/${courseId}/sessions`, {
      title: String(form.get("title") ?? ""),
      date: String(form.get("date") ?? ""),
      objectives: String(form.get("objectives") ?? ""),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    (document.getElementById("new-session-form") as HTMLFormElement | null)?.reset();
    router.refresh();
  }
  return (
    <form id="new-session-form" action={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Title">
        <input name="title" required className={inputClass} />
      </Field>
      <Field label="Date">
        <input name="date" type="date" required className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Objectives" hint="What learners should be able to do afterwards">
          <textarea name="objectives" rows={3} className={inputClass} />
        </Field>
      </div>
      {error ? <div className="sm:col-span-2"><Notice tone="danger">{error}</Notice></div> : null}
      <div>
        <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add session"}</Button>
      </div>
    </form>
  );
}
