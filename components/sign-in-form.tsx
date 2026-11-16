"use client";
import { useActionState } from "react";
import { requestMagicLink, verifySignInCode, type CodeState, type SignInState } from "@/app/sign-in/actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";

/** After the email is sent: the code from it signs in here, whichever device the email was read on. */
function CodeForm({ email, next }: { email: string; next: string }) {
  const [state, action, pending] = useActionState<CodeState, FormData>(verifySignInCode, { status: "idle", message: "" });
  return (
    <form action={action} className="space-y-3 border-t border-border pt-4" data-testid="sign-in-code">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <p className="text-sm text-muted">
        Open the link in the email on this device. If you&apos;re reading the email on another device, such as your phone, enter its 6-digit code here instead.
      </p>
      <Field label="Code from the email">
        <input
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123 456"
          maxLength={7}
          className={`${inputClass} text-lg tracking-widest`}
        />
      </Field>
      {state.status === "error" ? <Notice tone="danger">{state.message}</Notice> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in with the code"}
      </Button>
    </form>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestMagicLink, { status: "idle", message: "" });
  if (state.status === "sent" && state.email) {
    return (
      <div className="space-y-4">
        <Notice tone="success">{state.message}</Notice>
        <CodeForm email={state.email} next={next} />
      </div>
    );
  }
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
      <p className="text-sm text-muted">
        There are no passwords. We email you a link and a 6-digit code: open the link on this device, or type the code here.
      </p>
    </form>
  );
}
