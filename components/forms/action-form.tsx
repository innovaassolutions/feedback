"use client";
import { useActionState, type ReactNode } from "react";
import { Button, Notice } from "@/components/ui";
import type { FormState } from "@/lib/actions/organizations";

/** A form for a server action that redirects on success and returns a message on failure. */
export function ActionForm({ action, submit, children }: { action: (prev: FormState, form: FormData) => Promise<FormState>; submit: string; children: ReactNode }) {
  const [state, formAction, pending] = useActionState(action, { status: "idle", message: "" } as FormState);
  return (
    <form action={formAction} className="space-y-3">
      {children}
      {state.status === "error" ? <Notice tone="danger">{state.message}</Notice> : null}
      <Button type="submit" disabled={pending}>{pending ? "Working…" : submit}</Button>
    </form>
  );
}
