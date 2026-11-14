"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Field, Notice, inputClass } from "@/components/ui";

type Report = { enrolled: Array<{ email: string; name: string }>; skipped: Array<{ email: string; reason: string }>; invalid: string[] };

export function InviteForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    setReport(null);
    const res = await api<Report>("POST", `/api/courses/${courseId}/enrollments`, { emails: [String(form.get("emails") ?? "")] });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setReport(res.data);
    router.refresh();
  }
  return (
    <form action={submit} className="space-y-3">
      <Field label="Email addresses" hint="Paste one per line, or separated by commas. “Name <email>” works too.">
        <textarea name="emails" rows={5} required className={inputClass} />
      </Field>
      <Button type="submit" disabled={busy}>{busy ? "Inviting…" : "Invite learners"}</Button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {report ? (
        <div className="space-y-1 text-sm" data-testid="invite-report" role="status">
          <p>
            Enrolled {report.enrolled.length} {report.enrolled.length === 1 ? "learner" : "learners"} and sent each a sign-in link.
          </p>
          {report.skipped.map((s) => (
            <p key={s.email} className="text-muted">Skipped {s.email}: {s.reason}.</p>
          ))}
          {report.invalid.map((s) => (
            <p key={s} className="text-danger">Not a valid address: {s}</p>
          ))}
        </div>
      ) : null}
    </form>
  );
}
