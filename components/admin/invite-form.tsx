"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { splitPasted } from "@/lib/invitees";
import { Button, Field, Notice, inputClass } from "@/components/ui";

type Report = {
  enrolled: Array<{ email: string; name: string }>;
  skipped: Array<{ email: string; reason: string }>;
  invalid: string[];
  resent: string[];
  unsent: string[];
};

export function InviteForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    setReport(null);
    // One entry per learner. The whole list as one entry was refused once it passed 320 characters.
    const emails = splitPasted(String(form.get("emails") ?? ""));
    if (!emails.length) {
      setBusy(false);
      return setError("Paste at least one email address.");
    }
    if (emails.length > 500) {
      setBusy(false);
      return setError(`That's ${emails.length} entries. Invite up to 500 at a time.`);
    }
    const res = await api<Report>("POST", `/api/courses/${courseId}/enrollments`, { emails });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setReport(res.data);
    router.refresh();
  }
  return (
    <form action={submit} className="space-y-3">
      <Field label="Email addresses" hint="Paste one per line, or separated by commas. “Name <email>” works too. Each learner is emailed an invitation; inviting someone who hasn't signed in yet sends it again.">
        <textarea name="emails" rows={5} required className={inputClass} />
      </Field>
      <Button type="submit" disabled={busy}>{busy ? "Inviting…" : "Invite learners"}</Button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {report ? (
        <div className="space-y-1 text-sm" data-testid="invite-report" role="status">
          {report.enrolled.length ? (
            <p>
              Enrolled {report.enrolled.length} {report.enrolled.length === 1 ? "learner" : "learners"}
              {report.unsent.length ? "." : report.enrolled.length === 1 ? " and emailed them an invitation." : " and emailed each an invitation."}
            </p>
          ) : null}
          {report.resent.length ? <p>Sent the invitation again to {report.resent.join(", ")}, who hadn&apos;t signed in yet.</p> : null}
          {report.unsent.length ? (
            <p className="text-danger" data-testid="invite-unsent">
              Couldn&apos;t email {report.unsent.join(", ")} yet: an email limit was reached. They&apos;re enrolled. Invite the same addresses again in a few minutes to send their invitations.
            </p>
          ) : null}
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
