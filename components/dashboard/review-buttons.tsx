"use client";
import { useState } from "react";
import { analyseAgain, markAccuracy } from "@/lib/actions/review";
import { Button } from "@/components/ui";

/** Instructors say whether an interview's insights are accurate. Inaccurate ones become eval candidates. */
export function AccuracyButtons({ reference, current }: { reference: string; current: string | null }) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  async function mark(accuracy: "accurate" | "not_accurate") {
    const res = await markAccuracy(reference, accuracy);
    if (!res.ok) return setError(res.error);
    setValue(accuracy);
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="accuracy">
      <span className="text-muted">Are these insights accurate?</span>
      <Button variant={value === "accurate" ? "primary" : "secondary"} onClick={() => mark("accurate")} aria-pressed={value === "accurate"}>Accurate</Button>
      <Button variant={value === "not_accurate" ? "primary" : "secondary"} onClick={() => mark("not_accurate")} aria-pressed={value === "not_accurate"}>Not accurate</Button>
      {error ? <span className="text-danger">{error}</span> : null}
    </div>
  );
}

export function RetryButton({ reference }: { reference: string }) {
  const [done, setDone] = useState(false);
  return done ? (
    <span className="text-sm text-muted">Queued for analysis.</span>
  ) : (
    <Button variant="secondary" onClick={async () => { const r = await analyseAgain(reference); if (r.ok) setDone(true); }}>Analyse again</Button>
  );
}
