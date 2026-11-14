"use client";
import { useActionState } from "react";
import { requestMagicLink, type SignInState } from "@/app/sign-in/actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestMagicLink, { status: "idle", message: "" });
  if (state.status === "sent") return <Notice tone="success">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email address">
        <input name="email" type="email" required autoComplete="email" className={inputClass} placeholder="you@example.com" />
      </Field>
      {state.status === "error" ? <Notice tone="danger">{state.message}</Notice> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email me a sign-in link"}
      </Button>
      <p className="text-sm text-muted">There are no passwords. We send a link that signs you in.</p>
    </form>
  );
}
