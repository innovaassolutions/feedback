"use client";
import { useState } from "react";
import { removeMyData } from "@/lib/actions/review";
import { Button, Notice } from "@/components/ui";

export function MyData({ courseId }: { courseId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ interviews: number; questions: number } | null>(null);
  if (result) return <Notice tone="success">Removed {result.interviews} named interviews and {result.questions} questions.</Notice>;
  return confirming ? (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Remove your named feedback and your questions from this course? Anonymous and private feedback can&apos;t be traced to you, so it stays.</span>
      <Button variant="danger" onClick={async () => setResult(await removeMyData(courseId))}>Yes, remove them</Button>
      <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
    </div>
  ) : (
    <button type="button" className="text-sm text-primary underline" onClick={() => setConfirming(true)}>Remove my named feedback and questions</button>
  );
}
