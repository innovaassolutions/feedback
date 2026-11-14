"use client";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

/** The parts of the Vocal Bridge client this button uses. */
export type VoiceClient = {
  on(event: "transcript", handler: (e: { role: "user" | "agent"; text: string }) => void): unknown;
  on(event: "error", handler: (e: unknown) => void): unknown;
  onAIAgentQuery(handler: (query: string) => Promise<string>): unknown;
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
 * Audio is never stored.
 */
export function VoiceButton({
  interviewId,
  onPartial,
  onUtterance,
  onNotice,
}: {
  interviewId: string;
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
        const reply = await utter.current(query);
        return reply ?? "Sorry, I didn't catch that. Could you say it again?";
      });
      client.current = c;
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
