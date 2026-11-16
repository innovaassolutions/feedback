"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Field, Notice, cx, inputClass } from "@/components/ui";
import { WebAddressField } from "@/components/forms/web-address-field";

export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "date" | "number" | "textarea" | "select" | "web-address";
  value: string | number;
  hint?: string;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
  /** Shown but not sent, such as a web address only an organization admin may change. */
  locked?: boolean;
  /** Said under a locked field, such as who can change it. */
  lockedNote?: string;
  /** For a web address: everything before the short name. */
  base?: string;
  wide?: boolean;
};

/** Fills "{slug}" and similar from the saved record, so a changed web address can be followed. */
function fill(template: string, data: unknown): string {
  const values: Record<string, string> = {};
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" || typeof v === "number") values[k] ??= String(v);
      else walk(v);
    }
  };
  walk(data);
  return template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");
}

/**
 * Edits a record in place. With `toggle`, it shows a button until opened. Saving posts every
 * field to `path`; with `redirect`, the page then moves to that address (for a new web address).
 */
export function EditForm({
  path,
  fields,
  submit = "Save changes",
  toggle,
  redirect,
  testId,
}: {
  path: string;
  fields: FieldSpec[];
  submit?: string;
  toggle?: string;
  redirect?: string;
  testId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!toggle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} data-testid={testId ? `${testId}-open` : undefined}>
        {toggle}
      </Button>
    );
  }

  async function save(form: FormData) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = f.locked ? f.value : form.get(f.name);
      body[f.name] = f.type === "number" ? Number(raw) : String(raw ?? "");
    }
    const res = await api("POST", path, body);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (redirect) {
      router.push(fill(redirect, res.data));
      router.refresh();
      return;
    }
    setSaved(true);
    if (toggle) setOpen(false);
    router.refresh();
  }

  return (
    <form action={save} className="grid gap-3 sm:grid-cols-2" data-testid={testId}>
      {fields.map((f) => (
        <div key={f.name} className={cx(f.wide || f.type === "textarea" || f.type === "web-address" ? "sm:col-span-2" : "")}>
          {f.type === "web-address" ? (
            <WebAddressField
              name={f.name}
              label={f.label}
              base={f.base ?? ""}
              help={f.hint ?? ""}
              initial={String(f.value)}
              current={String(f.value)}
              locked={f.locked}
              lockedNote={f.lockedNote}
            />
          ) : (
          <Field label={f.label} hint={f.hint}>
            {f.type === "textarea" ? (
              <textarea name={f.name} defaultValue={String(f.value)} rows={3} className={inputClass} />
            ) : f.type === "select" ? (
              <select name={f.name} defaultValue={String(f.value)} className={inputClass}>
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                name={f.name}
                type={f.type ?? "text"}
                defaultValue={String(f.value)}
                min={f.min}
                max={f.max}
                required
                disabled={f.locked}
                className={inputClass}
              />
            )}
          </Field>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : submit}</Button>
        {toggle ? (
          <Button type="button" variant="ghost" onClick={() => { setOpen(false); setError(null); }}>
            Cancel
          </Button>
        ) : null}
        {saved && !toggle ? <span className="text-sm text-success" role="status">Saved.</span> : null}
      </div>
      {error ? <div className="sm:col-span-2"><Notice tone="danger">{error}</Notice></div> : null}
    </form>
  );
}

/** Deletes after a second click, without a browser dialog, then refreshes or moves on. */
export function DeleteButton({ path, what, label = "Delete", redirect, testId }: { path: string; what: string; label?: string; redirect?: string; testId?: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await api("DELETE", path);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setAsking(false);
    if (redirect) router.push(redirect);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col gap-1" data-testid={testId}>
      {asking ? (
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span>{label} {what}?</span>
          <Button type="button" variant="danger" disabled={busy} onClick={confirm}>
            {busy ? "Working…" : `Yes, ${label.toLowerCase()}`}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
        </span>
      ) : (
        <Button type="button" variant="danger" onClick={() => setAsking(true)} aria-label={`${label} ${what}`}>
          {label}
        </Button>
      )}
      {error ? <span role="alert" className="text-sm text-danger">{error}</span> : null}
    </span>
  );
}

/** Posts to an operation with no input, such as reading a documentation site again. */
export function ActionButton({ path, label, done }: { path: string; label: string; done: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setState("busy");
    setError(null);
    const res = await api("POST", path, {});
    if (!res.ok) {
      setState("idle");
      return setError(res.error);
    }
    setState("done");
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant="secondary" disabled={state !== "idle"} onClick={run}>
        {state === "done" ? done : state === "busy" ? "Working…" : label}
      </Button>
      {error ? <span role="alert" className="text-sm text-danger">{error}</span> : null}
    </span>
  );
}
