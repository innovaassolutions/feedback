"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { browserClient } from "@/lib/supabase/browser";
import { QUESTION_STATE_LABEL, SOURCE_KIND_LABEL } from "@/lib/labels";
import { Badge, Button, Card, Notice, inputClass } from "@/components/ui";
import type { QuestionView } from "@/lib/server/ops/questions";

type Answer = QuestionView["answers"][number];

export function Citations({ answer }: { answer: Answer }) {
  if (!answer.citations.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm" data-testid="citations">
      {answer.citations.map((c) => (
        <li key={c.chunk_id} className="flex flex-wrap items-center gap-2">
          <Badge>{SOURCE_KIND_LABEL[c.kind as keyof typeof SOURCE_KIND_LABEL] ?? c.kind}</Badge>
          {c.url ? (
            <a href={c.url} target={c.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer" data-testid="citation-link">{c.title}</a>
          ) : (
            <span data-testid="citation-name">{c.title}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function InstructorTools({ question, answer, onDone }: { question: QuestionView; answer: Answer | undefined; onDone: () => void }) {
  const [mode, setMode] = useState<"idle" | "edit" | "write">("idle");
  // Deleting asks once more, so a stray click doesn't remove a learner's question or an answer.
  const [confirming, setConfirming] = useState<"question" | "answer" | null>(null);
  const [text, setText] = useState(answer?.text ?? "");
  const [error, setError] = useState<string | null>(null);
  async function call(method: "POST" | "DELETE", path: string, body?: unknown) {
    setError(null);
    const res = await api(method, path, body);
    if (!res.ok) return setError(res.error);
    setMode("idle");
    setConfirming(null);
    onDone();
  }
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3" data-testid="instructor-tools">
      <div className="flex flex-wrap gap-2">
        {answer && answer.kind === "ai" && !answer.verified ? (
          <Button variant="secondary" onClick={() => call("POST", `/api/questions/${question.id}/answers`, { text: "", verifies_answer_id: answer.id })}>Verify</Button>
        ) : null}
        {answer ? <Button variant="secondary" onClick={() => { setText(answer.text); setMode("edit"); }}>Edit answer</Button> : null}
        <Button variant="secondary" onClick={() => { setText(""); setMode("write"); }}>{answer ? "Replace with my answer" : "Answer"}</Button>
        {answer && answer.kind === "instructor" ? <Button variant="danger" onClick={() => setConfirming("answer")}>Delete answer</Button> : null}
        <Button variant="danger" onClick={() => setConfirming("question")}>Delete question</Button>
      </div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Confirm delete">
          <span>{confirming === "question" ? "Delete this question and its answers for everyone?" : "Delete your answer?"}</span>
          <Button
            variant="danger"
            onClick={() => (confirming === "question" ? call("DELETE", `/api/questions/${question.id}`) : answer ? call("DELETE", `/api/answers/${answer.id}`) : undefined)}
          >
            Yes, delete
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
        </div>
      ) : null}
      {mode !== "idle" ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void call("POST", `/api/questions/${question.id}/answers`, { text, verifies_answer_id: mode === "edit" && answer ? answer.id : null });
          }}
        >
          <label className="sr-only" htmlFor={`answer-${question.id}`}>Your answer</label>
          <textarea id={`answer-${question.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={3} className={inputClass} />
          <div className="flex gap-2">
            <Button type="submit" disabled={!text.trim()}>Save answer</Button>
            <Button type="button" variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
          </div>
        </form>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}

export function QaBoard({ sessionId, canAsk, isInstructor, initial }: { sessionId: string; canAsk: boolean; isInstructor: boolean; initial: QuestionView[] }) {
  const [questions, setQuestions] = useState<QuestionView[]>(initial);
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await api<{ questions: QuestionView[] }>("GET", `/api/sessions/${sessionId}/questions`);
    if (res.ok) setQuestions(res.data.questions);
  }, [sessionId]);

  // Live updates: a question or answer posted anywhere shows up here without a reload. Realtime
  // applies Row Level Security, so the channel must carry the signed-in user's token.
  const [live, setLive] = useState("connecting");
  useEffect(() => {
    const db = browserClient();
    let channel: ReturnType<typeof db.channel> | null = null;
    let cancelled = false;
    void (async () => {
      const { data } = await db.auth.getSession();
      if (data.session) await db.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = db
        .channel(`qa-${sessionId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "questions", filter: `session_id=eq.${sessionId}` }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "answers", filter: `session_id=eq.${sessionId}` }, () => void refresh())
        .subscribe((status) => setLive(status));
    })();
    return () => {
      cancelled = true;
      if (channel) void db.removeChannel(channel);
    };
  }, [sessionId, refresh]);

  async function ask() {
    setBusy(true);
    setError(null);
    const res = await api("POST", `/api/sessions/${sessionId}/questions`, { text, anonymous });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setText("");
    void refresh();
  }

  async function vote(id: string) {
    const res = await api("POST", `/api/questions/${id}/votes`);
    if (!res.ok) setError(res.error);
    void refresh();
  }

  return (
    <div id="questions" className="scroll-mt-4 space-y-4" data-testid="qa-board" data-live={live}>
      {canAsk ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <label htmlFor="question" className="font-medium">Ask a question about this session</label>
          <textarea id="question" value={text} onChange={(e) => setText(e.target.value)} rows={2} className={inputClass} placeholder="How do I…?" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Ask anonymously
            </label>
            <Button type="submit" disabled={busy || text.trim().length < 3}>{busy ? "Posting…" : "Post question"}</Button>
          </div>
          <p className="text-xs text-muted">An AI answers straight away from the session&apos;s materials and the product documentation, and says where it found it. Your instructor reviews answers.</p>
        </form>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <ul className="space-y-3" data-testid="question-list">
        {questions.map((q) => {
          const answer = q.answers[0];
          return (
            <li key={q.id} id={`q-${q.id}`}>
              <Card className="space-y-2" data-testid="question">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium" data-testid="question-text">{q.text}</p>
                    <p className="text-sm text-muted" data-testid="question-author">{q.author}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={q.state === "answered" ? "success" : q.state === "ai_answered" ? "primary" : "neutral"}>
                      <span data-testid="question-state">{QUESTION_STATE_LABEL[q.state]}</span>
                    </Badge>
                    {q.sent_to_instructor && q.state !== "answered" && q.state !== "needs_instructor" ? <Badge>Sent to instructor</Badge> : null}
                  </div>
                </div>
                {answer ? (
                  <div className="rounded-theme bg-background p-3" data-testid="answer">
                    <p className="whitespace-pre-line">{answer.text}</p>
                    {answer.sources_disagree ? <p className="mt-1 text-sm text-danger">The sources disagree on this. Your instructor has been asked to check.</p> : null}
                    <Citations answer={answer} />
                  </div>
                ) : null}
                {canAsk ? (
                  <button
                    type="button"
                    onClick={() => vote(q.id)}
                    disabled={q.voted || q.mine}
                    aria-pressed={q.voted}
                    data-testid="vote"
                    className="text-sm text-primary underline disabled:no-underline disabled:opacity-60"
                  >
                    {q.voted ? "You have this question too" : "I have this question too"} · {q.votes}
                  </button>
                ) : (
                  <p className="text-sm text-muted">{q.votes} {q.votes === 1 ? "learner has" : "learners have"} this question</p>
                )}
                {isInstructor ? <InstructorTools question={q} answer={answer} onDone={() => void refresh()} /> : null}
              </Card>
            </li>
          );
        })}
        {questions.length === 0 ? <li className="text-muted">No questions yet.</li> : null}
      </ul>
    </div>
  );
}
