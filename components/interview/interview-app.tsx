"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { ANONYMITY_LABEL } from "@/lib/labels";
import { Button, Card, Notice, cx, inputClass } from "@/components/ui";
import type { ChatMessage, PublicInterview } from "@/lib/server/ops/interviews";
import { VoiceButton, type VoiceState } from "@/components/interview/voice";
import { PostedQuestions, type PostedQuestion } from "@/components/interview/posted-questions";

type Anonymity = "named" | "anonymous" | "private";

const LEVELS: Array<{ id: Anonymity; text: string }> = [
  { id: "named", text: "Your instructor sees your name, your ratings and the conversation." },
  { id: "anonymous", text: "Your instructor sees your ratings and the conversation, with no name or time. They only see it once enough learners have responded." },
  { id: "private", text: "Your instructor sees nothing individual. Your answers count toward the scores and themes, and your words are deleted once they've been analysed." },
];

const STEPS = [
  { stage: "consent", label: "Consent" },
  { stage: "ratings", label: "Ratings" },
  { stage: "conversation", label: "Conversation" },
  { stage: "read_back", label: "Summary" },
] as const;

function AnonymityChoice({ value, onChange, name }: { value: Anonymity; onChange: (a: Anonymity) => void; name: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 font-medium">How anonymous do you want to be?</legend>
      {LEVELS.map((l) => (
        <label key={l.id} className={cx("flex cursor-pointer gap-3 rounded-theme border p-3", value === l.id ? "border-primary bg-primary-soft" : "border-border")}>
          <input type="radio" name={name} value={l.id} checked={value === l.id} onChange={() => onChange(l.id)} className="mt-1" />
          <span>
            <span className="font-medium">{ANONYMITY_LABEL[l.id]}</span>
            <span className="block text-sm text-muted">{l.text}</span>
          </span>
        </label>
      ))}
      <p className="text-sm text-muted">
        In a small group, the way you write can still identify you. Private is the safest choice.
      </p>
    </fieldset>
  );
}

function StageMarker({ stage }: { stage: string }) {
  const index = STEPS.findIndex((s) => s.stage === stage);
  return (
    <ol className="mb-4 flex flex-wrap gap-2 text-sm" data-testid="stage-marker" aria-label="Interview progress">
      {STEPS.map((s, i) => (
        <li
          key={s.stage}
          aria-current={i === index ? "step" : undefined}
          className={cx("rounded-full px-3 py-1", i === index ? "bg-primary text-on-primary" : i < index ? "bg-primary-soft text-primary" : "border border-border text-muted")}
        >
          {s.label}
        </li>
      ))}
    </ol>
  );
}

export function InterviewApp(props: {
  sessionId: string;
  /** The session's page, where its Q&A board is. */
  boardHref: string;
  kind: "session" | "follow_up";
  initial: { interview: PublicInterview; messages: ChatMessage[] } | null;
  voiceEnabled: boolean;
}) {
  const [interview, setInterview] = useState<PublicInterview | null>(props.initial?.interview ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>(props.initial?.messages ?? []);
  const [anonymity, setAnonymity] = useState<Anonymity>(props.initial?.interview.anonymity ?? "anonymous");
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<PostedQuestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(props.initial?.interview.state !== undefined && props.initial.interview.state !== "in_progress");
  const [rated, setRated] = useState(false);
  const [points, setPoints] = useState<string[]>(props.initial?.interview.summary ?? []);
  const [livePartial, setLivePartial] = useState<string>("");
  // How the learner chose to answer on the entrance screen. Voice starts with the welcome read aloud.
  const [answerBy, setAnswerBy] = useState<"voice" | "chat">("chat");
  const [voiceState, setVoiceState] = useState<VoiceState>("off");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [messages, livePartial]);

  /** Takes the server's view of the interview, and fresh read-back points when they change. */
  function applyInterview(next: PublicInterview) {
    if (next.summary && JSON.stringify(next.summary) !== JSON.stringify(interview?.summary)) setPoints(next.summary);
    setInterview(next);
  }

  async function start(by: "voice" | "chat") {
    setBusy(true);
    setError(null);
    setAnswerBy(by);
    if (by === "voice") setVoiceState("starting");
    const res = await api<{ interview: PublicInterview; messages: ChatMessage[] }>("POST", `/api/sessions/${props.sessionId}/interviews`, { anonymity, kind: props.kind });
    setBusy(false);
    if (!res.ok) {
      setVoiceState("off");
      return setError(res.error);
    }
    applyInterview(res.data.interview);
    setMessages(res.data.messages);
  }

  /** Sends one learner turn, typed or spoken, and returns the Interviewer's reply text. */
  async function send(turn: string, mode: "text" | "voice"): Promise<string | null> {
    if (!interview || !turn.trim()) return null;
    setBusy(true);
    setError(null);
    setMessages((m) => [...m, { role: "learner", text: turn, mode }]);
    const res = await api<{ reply: ChatMessage; interview: PublicInterview; questions?: PostedQuestion[] }>("POST", `/api/interviews/${interview.id}/turns`, { text: turn, mode });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    setMessages((m) => [...m, res.data.reply]);
    if (res.data.questions?.length) setPosted((p) => [...p, ...res.data.questions!.filter((q) => !p.some((x) => x.id === q.id))]);
    applyInterview(res.data.interview);
    return res.data.reply.text;
  }

  async function chip(itemId: string, choice: string, label: string) {
    if (!interview) return;
    setBusy(true);
    setError(null);
    const res = await api<{ reply: ChatMessage | null; interview: PublicInterview }>("POST", `/api/interviews/${interview.id}/ratings`, { item_id: itemId, choice });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (interview.stage === "ratings" && interview.pending_rating?.id === itemId) {
      setMessages((m) => [...m, { role: "learner", text: label, mode: "chip" }, ...(res.data.reply ? [res.data.reply] : [])]);
    }
    applyInterview(res.data.interview);
  }

  async function submit() {
    if (!interview) return;
    setBusy(true);
    setError(null);
    const res = await api("POST", `/api/interviews/${interview.id}/submit`, { anonymity, summary: points.map((p) => p.trim()).filter(Boolean) });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setSubmitted(true);
  }

  async function rate(rating: "helpful" | "okay" | "not_helpful") {
    if (!interview) return;
    await api("POST", `/api/interviews/${interview.id}/feedback`, { rating });
    setRated(true);
  }

  if (submitted) {
    return (
      <Card className="space-y-4" data-testid="thank-you">
        <h2 className="text-xl font-semibold">Thank you. Your feedback is in.</h2>
        <p className="text-muted">Your instructor reviews feedback before the next session. You&apos;ll see what changed on the session page.</p>
        {rated ? (
          <p className="text-sm text-muted">Thanks for rating the interview.</p>
        ) : (
          <div>
            <p className="mb-2 text-sm">How was this interview?</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => rate("helpful")}>Helpful</Button>
              <Button variant="secondary" onClick={() => rate("okay")}>Okay</Button>
              <Button variant="secondary" onClick={() => rate("not_helpful")}>Not helpful</Button>
            </div>
          </div>
        )}
      </Card>
    );
  }

  if (!interview) {
    return (
      <Card className="space-y-5" data-testid="consent">
        <div>
          <h2 className="text-xl font-semibold">Before we start</h2>
          <p className="mt-1 text-muted">
            A short conversation with an AI interviewer, about five to eight minutes. You can type or speak, and switch at any point. Audio is never stored: speech is turned into text.
          </p>
        </div>
        <AnonymityChoice value={anonymity} onChange={setAnonymity} name="anonymity-start" />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {props.voiceEnabled ? (
          <div className="space-y-2" role="group" aria-labelledby="answer-by">
            <p id="answer-by" className="font-medium">How would you like to answer?</p>
            <p className="text-sm text-muted">With voice, the interviewer reads each question aloud and listens to your answer. You can switch to typing at any point.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => start("voice")} disabled={busy}>
                <span aria-hidden className="mr-1">🎙</span>
                {busy && answerBy === "voice" ? "Starting…" : "Start with voice"}
              </Button>
              <Button variant="secondary" onClick={() => start("chat")} disabled={busy}>
                <span aria-hidden className="mr-1">💬</span>
                {busy && answerBy === "chat" ? "Starting…" : "Start with chat"}
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => start("chat")} disabled={busy}>{busy ? "Starting…" : "Start the interview"}</Button>
        )}
      </Card>
    );
  }

  const pending = interview.pending_rating;
  const missing = interview.rating_items.filter((r) => !(r.id in interview.ratings));

  return (
    <div className="space-y-4">
      <StageMarker stage={interview.stage} />
      <Card className="p-0">
        <div className="max-h-[60vh] min-h-64 space-y-3 overflow-y-auto p-4" data-testid="chat-log" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={cx("flex", m.role === "learner" ? "justify-end" : "justify-start")}>
              <div
                data-testid={m.role === "learner" ? "learner-bubble" : "interviewer-bubble"}
                data-mode={m.mode}
                className={cx(
                  "max-w-[85%] whitespace-pre-line rounded-theme px-4 py-2",
                  m.role === "learner" ? "bg-primary text-on-primary" : "border border-border bg-background",
                )}
              >
                {m.mode === "voice" ? <span aria-label="Spoken" title="Spoken" className="mr-1">🎙</span> : null}
                {m.text}
              </div>
            </div>
          ))}
          {livePartial ? (
            <div className="flex justify-end">
              <div data-testid="live-transcript" className="max-w-[85%] rounded-theme border border-dashed border-primary px-4 py-2 text-muted">
                <span aria-label="Spoken" className="mr-1">🎙</span>
                {livePartial}
              </div>
            </div>
          ) : null}
          {busy ? <p className="text-sm text-muted">…</p> : null}
          <div ref={bottom} />
        </div>
        {interview.stage === "consent" ? (
          <div className="border-t border-border p-4" data-testid="welcome-step">
            {voiceState === "on" ? (
              <p>Listen to the welcome, then say that you are ready.</p>
            ) : voiceState === "starting" ? (
              <p className="text-muted">Starting the voice…</p>
            ) : (
              <Button onClick={() => send("Ready", "text")} disabled={busy}>Start</Button>
            )}
          </div>
        ) : null}
        {pending ? (
          <div className="flex flex-wrap gap-2 border-t border-border p-4" role="group" aria-label={pending.prompt}>
            {pending.choices.map((c) => (
              <button
                key={c.id}
                type="button"
                data-testid="rating-chip"
                disabled={busy}
                onClick={() => chip(pending.id, c.id, c.label)}
                className="rounded-full border border-primary px-3 py-1.5 text-sm text-primary hover:bg-primary-soft disabled:opacity-50"
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="flex items-end gap-2 border-t border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const t = text;
            setText("");
            void send(t, "text");
          }}
        >
          <label className="sr-only" htmlFor="turn">Your answer</label>
          <textarea
            id="turn"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
            rows={2}
            placeholder={interview.stage === "read_back" ? "Tell the interviewer what to change, or edit the points below" : "Type your answer"}
            className={inputClass}
          />
          {props.voiceEnabled ? (
            <VoiceButton
              interviewId={interview.id}
              currentPrompt={[...messages].reverse().find((m) => m.role === "interviewer")?.text ?? null}
              autoStart={answerBy === "voice"}
              onStateChange={setVoiceState}
              onPartial={setLivePartial}
              onUtterance={async (spoken) => {
                setLivePartial("");
                return send(spoken, "voice");
              }}
              onNotice={setError}
            />
          ) : null}
          <Button type="submit" disabled={busy || !text.trim()}>Send</Button>
        </form>
      </Card>
      <PostedQuestions sessionId={props.sessionId} questions={posted} boardHref={props.boardHref} />
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {interview.stage === "read_back" ? (
        <Card className="space-y-4" data-testid="summary-screen">
          <div>
            <h2 className="text-lg font-semibold">Check the summary</h2>
            <p className="text-sm text-muted">This is what the instructor will read as your main points. Edit or remove anything that isn&apos;t right.</p>
          </div>
          <ol className="space-y-2">
            {points.map((p, i) => (
              <li key={i} className="flex gap-2">
                <label className="sr-only" htmlFor={`point-${i}`}>Point {i + 1}</label>
                <textarea
                  id={`point-${i}`}
                  data-testid="summary-point"
                  value={p}
                  rows={2}
                  onChange={(e) => setPoints((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))}
                  className={inputClass}
                />
                <Button variant="ghost" type="button" onClick={() => setPoints((ps) => ps.filter((_, j) => j !== i))} aria-label={`Remove point ${i + 1}`}>
                  Remove
                </Button>
              </li>
            ))}
          </ol>
          {points.length < 8 ? (
            <Button variant="secondary" type="button" onClick={() => setPoints((ps) => [...ps, ""])}>Add a point</Button>
          ) : null}
          {missing.length ? (
            <div className="space-y-2">
              <p className="font-medium">Still to answer</p>
              {missing.map((item) => (
                <div key={item.id} role="group" aria-label={item.prompt} className="space-y-1">
                  <p className="text-sm">{item.prompt}</p>
                  <div className="flex flex-wrap gap-2">
                    {item.choices.map((c) => (
                      <button key={c.id} type="button" onClick={() => chip(item.id, c.id, c.label)} className="rounded-full border border-primary px-3 py-1 text-sm text-primary">
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <AnonymityChoice value={anonymity} onChange={setAnonymity} name="anonymity-submit" />
          <Button onClick={submit} disabled={busy || !points.some((p) => p.trim())}>Submit feedback</Button>
        </Card>
      ) : null}
    </div>
  );
}
