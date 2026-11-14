"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { SESSION_STATE_LABEL, nextSessionState, type SessionState } from "@/lib/labels";
import { Button } from "@/components/ui";

export function StateButton({ sessionId, state }: { sessionId: string; state: SessionState }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = nextSessionState(state);
  if (!next) return null;
  async function move() {
    setBusy(true);
    setError(null);
    const res = await api("POST", `/api/sessions/${sessionId}/state`, { state: next });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={move} disabled={busy}>
        Move to {SESSION_STATE_LABEL[next]}
      </Button>
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}
