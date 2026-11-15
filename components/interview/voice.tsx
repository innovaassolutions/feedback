"use client";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

/** The parts of the Vocal Bridge client this button uses. */
export type VoiceClient = {
  on(event: "transcript", handler: (e: { role: "user" | "agent"; text: string }) => void): unknown;
  on(event: "error", handler: (e: unknown) => void): unknown;
  onAIAgentQuery(handler: (query: string) => Promise<string>): unknown;
  sendAction(action: string, payload?: Record<string, unknown>): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
};
type Factory = (options: { auth: { tokenUrl: string }; participantName: string; autoPlayAudio: boolean }) => VoiceClient;

declare global {
  interface Window {
    /** Lets the end-to-end tests stand in for Vocal Bridge, so they never call the real service. */
    __vocalBridgeFactory?: Factory;
  }
}

const NOTICE_MIC = "We couldn't use your microphone, so voice is off. You can keep typing.";
const NOTICE_SERVICE = "Voice isn't available right now. You can keep typing.";

/**
 * The microphone button. Vocal Bridge runs in its AI Agent mode: it transcribes what the learner
 * says, we pass it to send_turn like a typed turn, and Vocal Bridge speaks the Interviewer's reply.
 * Any other question on screen (the one waiting when voice starts, or the next one after a chip
 * tap) is sent with the agent's read_aloud action, so the learner is never left in silence.
 * Audio is never stored by the app.
 */
export function VoiceButton({
  interviewId,
  currentPrompt,
  onPartial,
  onUtterance,
  onNotice,
}: {
  interviewId: string;
  /** The Interviewer's latest message, to read aloud if it wasn't already spoken as a reply. */
  currentPrompt: string | null;
  onPartial: (text: string) => void;
  onUtterance: (text: string) => Promise<string | null>;
  onNotice: (message: string) => void;
}) {
  const [state, setState] = useState<"off" | "starting" | "on">("off");
  const client = useRef<VoiceClient | null>(null);
  const utter = useRef(onUtterance);
  useEffect(() => {
    utter.current = onUtterance;
  }, [onUtterance]);
  // The last text Vocal Bridge spoke or was asked to speak, so nothing is read twice.
  const spoken = useRef<string | null>(null);
  // While a spoken turn is in flight, its reply goes back as the turn's answer and must not be read twice.
  const inFlight = useRef(false);

  function readAloud(c: VoiceClient, text: string | null) {
    if (!text || text === spoken.current || inFlight.current) return;
    spoken.current = text;
    void c.sendAction("read_aloud", { text }).catch(() => {});
  }

  useEffect(() => {
    if (state === "on" && client.current) readAloud(client.current, currentPrompt);
  }, [state, currentPrompt]);

  async function stop() {
    const c = client.current;
    client.current = null;
    setState("off");
    onPartial("");
    if (c) await c.disconnect().catch(() => {});
  }

  // Leaving the interview (or submitting it, which unmounts this button) ends the voice session.
  useEffect(() => {
    return () => {
      void client.current?.disconnect().catch(() => {});
    };
  }, []);

  async function start() {
    setState("starting");
    // Ask for the microphone first, so a refusal is caught before connecting.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setState("off");
      onNotice(NOTICE_MIC);
      return;
    }
    try {
      const factory: Factory =
        window.__vocalBridgeFactory ??
        (await import("@vocalbridgeai/sdk").then((m) => (options: Parameters<Factory>[0]) => new m.VocalBridge(options) as unknown as VoiceClient));
      // The name is decided on the server; this value is ignored there.
      const c = factory({ auth: { tokenUrl: `/api/interviews/${interviewId}/voice-token` }, participantName: "Learner", autoPlayAudio: true });
      c.on("transcript", (e) => {
        if (e.role === "user") onPartial(e.text);
      });
      c.on("error", () => {
        onNotice(NOTICE_SERVICE);
        void stop();
      });
      c.onAIAgentQuery(async (query) => {
        onPartial("");
        inFlight.current = true;
        try {
          const reply = (await utter.current(query)) ?? "Sorry, I didn't catch that. Could you say it again?";
          spoken.current = reply;
          return reply;
        } finally {
          inFlight.current = false;
        }
      });
      client.current = c;
      spoken.current = null;
      await c.connect();
      await c.setMicrophoneEnabled(true);
      setState("on");
    } catch {
      client.current = null;
      setState("off");
      onPartial("");
      onNotice(NOTICE_SERVICE);
    }
  }

  return (
    <button
      type="button"
      onClick={() => (state === "off" ? void start() : void stop())}
      disabled={state === "starting"}
      aria-pressed={state === "on"}
      aria-label={state === "on" ? "Stop listening" : "Answer by voice"}
      data-testid="mic-button"
      data-state={state}
      className={cx(
        "inline-flex h-10 shrink-0 items-center gap-1 rounded-theme border px-3 text-sm",
        state === "on" ? "border-primary bg-primary text-on-primary" : "border-border text-primary hover:bg-primary-soft",
      )}
    >
      <span aria-hidden>🎙</span>
      {state === "on" ? "Listening" : state === "starting" ? "Starting…" : "Speak"}
    </button>
  );
}
