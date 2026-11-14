"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Field, Notice, inputClass } from "@/components/ui";

type Brief = { objectives: string[]; topics: string[]; known_issues: string[] };
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

/** The instructor edits the Librarian's draft and approves it. Only an approved brief reaches the Interviewer. */
export function BriefEditor({ sessionId, initial, approvedAt, draftAt }: { sessionId: string; initial: Brief | null; approvedAt: string | null; draftAt: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function approve(form: FormData) {
    setError(null);
    setSaved(false);
    const res = await api("POST", `/api/sessions/${sessionId}/brief`, {
      objectives: lines(String(form.get("objectives") ?? "")),
      topics: lines(String(form.get("topics") ?? "")),
      known_issues: lines(String(form.get("known_issues") ?? "")),
    });
    if (!res.ok) return setError(res.error);
    setSaved(true);
    router.refresh();
  }
  return (
    <form action={approve} className="space-y-3" data-testid="brief-editor">
      <p className="text-sm text-muted">
        {approvedAt ? `Approved ${new Date(approvedAt).toLocaleString("en-GB")}. ` : "Not approved yet: the Interviewer won't use it until you approve it. "}
        {draftAt ? `The Librarian drafted it from the documents on ${new Date(draftAt).toLocaleString("en-GB")}.` : "Upload documents and the Librarian will draft it."}
      </p>
      <Field label="Objectives" hint="One per line">
        <textarea name="objectives" rows={4} defaultValue={initial?.objectives.join("\n") ?? ""} className={inputClass} />
      </Field>
      <Field label="Topics covered" hint="One per line">
        <textarea name="topics" rows={5} defaultValue={initial?.topics.join("\n") ?? ""} className={inputClass} />
      </Field>
      <Field label="Known issues" hint="One per line">
        <textarea name="known_issues" rows={3} defaultValue={initial?.known_issues.join("\n") ?? ""} className={inputClass} />
      </Field>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {saved ? <Notice tone="success">Brief approved. The Interviewer will use it.</Notice> : null}
      <Button type="submit">Approve brief</Button>
    </form>
  );
}
