"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Field, Notice, inputClass } from "@/components/ui";

const ROLE_CHOICES = [
  {
    value: "org_admin",
    label: "Organization admin",
    description: "Manages branding, courses and people, sets up every course, and sees every course's results and transcripts.",
  },
  {
    value: "instructor",
    label: "Instructor",
    description: "Runs one course: sessions, documents, the roster and the interview guide. Sees its results and transcripts, and answers learners' questions.",
  },
  {
    value: "sponsor",
    label: "Sponsor",
    description: "Views one course's outcomes: the dashboard, themes, “You said, we did” and the printed report. Never transcripts, quotes or anything from a single learner. For executives and managers.",
  },
] as const;

type Role = (typeof ROLE_CHOICES)[number]["value"];
type Added = { account_created: boolean; emailed: boolean };

function sentNote(name: string, what: string, result: Added) {
  return result.emailed
    ? `Added ${name} as ${what}. A sign-in email is on its way to them.`
    : `Added ${name} as ${what}. The sign-in email couldn't be sent just now (one per address a minute); they can ask for one on the sign-in page.`;
}

export function AddStaffForm({ organizationId, courses }: { organizationId: string; courses: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>("instructor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const needsCourse = role !== "org_admin";

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    setDone(null);
    const name = String(form.get("name") ?? "").trim();
    const res = await api<Added>("POST", `/api/organizations/${organizationId}/staff`, {
      name,
      email: String(form.get("email") ?? ""),
      role,
      course_id: needsCourse ? String(form.get("course_id") ?? "") || null : null,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    const choice = ROLE_CHOICES.find((r) => r.value === role)!;
    const course = needsCourse ? courses.find((c) => c.id === form.get("course_id"))?.title : null;
    setDone(sentNote(name, `${choice.label.toLowerCase()}${course ? ` on ${course}` : ""}`, res.data));
    router.refresh();
  }

  return (
    <form action={submit} className="space-y-4" data-testid="add-person">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input name="name" required autoComplete="off" className={inputClass} />
        </Field>
        <Field label="Email address">
          <input name="email" type="email" required autoComplete="off" className={inputClass} />
        </Field>
      </div>
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 font-medium">Role</legend>
        {ROLE_CHOICES.map((r) => (
          <label key={r.value} className="flex gap-3 rounded-theme border border-border p-3">
            <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} className="mt-1" />
            <span>
              <span className="font-medium">{r.label}</span>
              <span className="block text-muted">{r.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {needsCourse ? (
        courses.length ? (
          <Field label="Course">
            <select name="course_id" required className={inputClass} defaultValue={courses.length === 1 ? courses[0].id : ""}>
              {courses.length > 1 ? <option value="">Choose a course</option> : null}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </Field>
        ) : (
          <Notice>Instructors and sponsors belong to a course. Create the course first, under Courses.</Notice>
        )
      ) : null}
      <Button type="submit" disabled={busy || (needsCourse && !courses.length)}>{busy ? "Adding…" : "Add and email a sign-in link"}</Button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {done ? <Notice tone="success">{done}</Notice> : null}
    </form>
  );
}

export function AddPlatformAdminForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    setDone(null);
    const name = String(form.get("name") ?? "").trim();
    const res = await api<Added>("POST", "/api/platform/admins", { name, email: String(form.get("email") ?? "") });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDone(sentNote(name, "a platform admin", res.data));
    router.refresh();
  }

  return (
    <form action={submit} className="space-y-3" data-testid="add-platform-admin">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input name="name" required autoComplete="off" className={inputClass} />
        </Field>
        <Field label="Email address">
          <input name="email" type="email" required autoComplete="off" className={inputClass} />
        </Field>
      </div>
      <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add and email a sign-in link"}</Button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {done ? <Notice tone="success">{done}</Notice> : null}
    </form>
  );
}

/** Removes something after a second click, without a browser dialog. */
export function RemoveButton({ path, what }: { path: string; what: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    const res = await api("DELETE", path);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setAsking(false);
    router.refresh();
  }

  if (error) return <span className="text-sm text-danger">{error}</span>;
  if (!asking) {
    return (
      <button type="button" className="text-sm text-danger underline" onClick={() => setAsking(true)} aria-label={`Remove ${what}`}>
        Remove
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-sm">
      <span>Remove {what}?</span>
      <button type="button" className="font-medium text-danger underline" disabled={busy} onClick={remove}>
        {busy ? "Removing…" : "Yes, remove"}
      </button>
      <button type="button" className="underline" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  );
}
