"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { QUESTION_STATE_LABEL } from "@/lib/labels";
import { Card } from "@/components/ui";
import { Citations } from "@/components/qa/board";
import type { QuestionView } from "@/lib/server/ops/questions";

export type PostedQuestion = { id: string; text: string };

const POLL_MS = 4000;
const GIVE_UP_MS = 5 * 60_000;

/**
 * The questions a learner posted from this interview, with the Librarian's answer once it's ready.
 * The interview carries on meanwhile; the answer also goes on the session's Q&A board.
 */
export function PostedQuestions({ sessionId, questions, boardHref }: { sessionId: string; questions: PostedQuestion[]; boardHref: string }) {
  const [views, setViews] = useState<Record<string, QuestionView>>({});
  const waiting = questions.some((q) => {
    const v = views[q.id];
    return !v || (v.state === "open" && !v.answers.length);
  });

  useEffect(() => {
    if (!questions.length || !waiting) return;
    const started = Date.now();
    let stopped = false;
    const poll = async () => {
      if (stopped || Date.now() - started > GIVE_UP_MS) return;
      const res = await api<{ questions: QuestionView[] }>("GET", `/api/sessions/${sessionId}/questions`);
      if (res.ok && !stopped) {
        const ids = new Set(questions.map((q) => q.id));
        setViews((prev) => ({ ...prev, ...Object.fromEntries(res.data.questions.filter((q) => ids.has(q.id)).map((q) => [q.id, q])) }));
      }
    };
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [questions, sessionId, waiting]);

  if (!questions.length) return null;
  return (
    <section aria-label="Your questions" className="space-y-3" data-testid="posted-questions">
      {questions.map((q) => {
        const v = views[q.id];
        const answer = v?.answers[0];
        return (
          <Card key={q.id} className="space-y-2" data-testid="posted-question">
            <p className="text-sm text-muted">Your question, posted to the session&apos;s Q&amp;A board</p>
            <p className="font-medium">{q.text}</p>
            {answer ? (
              <div className="rounded-theme bg-background p-3" data-testid="posted-answer">
                <p className="mb-1 text-sm text-muted">{QUESTION_STATE_LABEL[v.state]}</p>
                <p className="whitespace-pre-line">{answer.text}</p>
                <Citations answer={answer} />
              </div>
            ) : v?.state === "needs_instructor" ? (
              <p className="text-sm text-muted">The course&apos;s materials don&apos;t cover this, so your instructor will answer it on the Q&amp;A board.</p>
            ) : (
              <p className="text-sm text-muted" role="status">Finding the answer in the course&apos;s materials… You can carry on meanwhile.</p>
            )}
            <a href={boardHref} target="_blank" rel="noreferrer" className="text-sm">
              Open the Q&amp;A board
            </a>
          </Card>
        );
      })}
    </section>
  );
}
