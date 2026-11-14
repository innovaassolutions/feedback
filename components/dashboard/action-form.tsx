"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Field, Notice, inputClass } from "@/components/ui";

export function ActionForm({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function submit(form: FormData) {
    setError(null);
    const res = await api("POST", `/api/sessions/${sessionId}/actions`, {
      you_said: String(form.get("you_said") ?? ""),
      we_did: String(form.get("we_did") ?? ""),
      status: String(form.get("status") ?? "planned"),
    });
    if (!res.ok) return setError(res.error);
    (document.getElementById("action-form") as HTMLFormElement | null)?.reset();
    router.refresh();
  }
  return (
    <form id="action-form" action={submit} className="grid gap-3 sm:grid-cols-2 no-print">
      <Field label="You said">
        <textarea name="you_said" required rows={2} className={inputClass} placeholder="The Core Agent part felt rushed" />
      </Field>
      <Field label="We did">
        <textarea name="we_did" required rows={2} className={inputClass} placeholder="Session 2 starts with a ten-minute Core Agent recap" />
      </Field>
      <Field label="Status">
        <select name="status" className={inputClass} defaultValue="planned">
          <option value="planned">Planned</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
      </Field>
      <div className="flex items-end">
        <Button type="submit">Record change</Button>
      </div>
      {error ? <div className="sm:col-span-2"><Notice tone="danger">{error}</Notice></div> : null}
    </form>
  );
}
