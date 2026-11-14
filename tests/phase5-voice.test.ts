import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { getVoiceToken, saveRating, sendTurn, startInterview } from "@/lib/server/ops/interviews";
import { sql } from "./support/db";
import { ctxAs, statusOf } from "./support/ctx";
import { openSession } from "./support/interview";

/** A stand-in for Vocal Bridge's token endpoint that records what it was sent. */
function fakeVoiceService() {
  const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ url: "wss://voice.example", token: "t", room_name: "r", participant_identity: "p", expires_in: 600 }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

describe("get_voice_token", () => {
  it("is 401 without a valid interview token", async () => {
    const s = await openSession("Voice token");
    const owner = await ctxAs("aisha");
    const { interview } = await startInterview(owner, { session_id: s.id, anonymity: "anonymous", kind: "session" });
    const fake = fakeVoiceService();
    const elsewhere = await ctxAs("aisha"); // the same learner in another browser: no cookie
    expect(await statusOf(getVoiceToken(elsewhere, { interview_id: interview.id }, fake.fetcher))).toBe(401);
    elsewhere.jar.set([...owner.jar.keys()][0], "not-the-token");
    expect(await statusOf(getVoiceToken(elsewhere, { interview_id: interview.id }, fake.fetcher))).toBe(401);
    expect(fake.calls).toEqual([]);
    const token = await getVoiceToken(owner, { interview_id: interview.id }, fake.fetcher);
    expect(token.token).toBe("t");
    expect(fake.calls[0].url).toMatch(/\/api\/v1\/token$/);
    expect(fake.calls[0].headers["X-API-Key"]).toBe(process.env.VOCAL_BRIDGE_API_KEY);
  });

  it("sends the participant name “Learner” for anonymous and private interviews, and the first name for named ones", async () => {
    const s = await openSession("Voice names");
    const fake = fakeVoiceService();
    for (const [who, anonymity] of [["ben", "anonymous"], ["chloe", "private"], ["diego", "named"]] as const) {
      const ctx = await ctxAs(who);
      const { interview } = await startInterview(ctx, { session_id: s.id, anonymity, kind: "session" });
      await getVoiceToken(ctx, { interview_id: interview.id }, fake.fetcher);
    }
    expect(fake.calls.map((c) => c.body.participant_name)).toEqual(["Learner", "Learner", "Diego"]);
  });

  it("returns 502 when the voice service can't be reached, so the page can show a notice", async () => {
    const s = await openSession("Voice down");
    const ctx = await ctxAs("elena");
    const { interview } = await startInterview(ctx, { session_id: s.id, anonymity: "anonymous", kind: "session" });
    // The test environment points VOCAL_BRIDGE_API_URL at a closed local port.
    expect(process.env.VOCAL_BRIDGE_API_URL).toBe("http://127.0.0.1:9");
    expect(await statusOf(getVoiceToken(ctx, { interview_id: interview.id }))).toBe(502);
  });

  it("the API key appears nowhere in app or components", () => {
    let out = "";
    try {
      out = execFileSync("grep", ["-rn", "VOCAL_BRIDGE_API_KEY", "app", "components"], { encoding: "utf8" });
    } catch (err) {
      out = (err as { stdout?: string }).stdout ?? "";
    }
    expect(out).toBe("");
  });
});

describe("spoken ratings", () => {
  async function atPace(who: "farid" | "grace") {
    const s = await openSession(`Voice pace ${who}`);
    const ctx = await ctxAs(who);
    let { interview } = await startInterview(ctx, { session_id: s.id, anonymity: "anonymous", kind: "session" });
    interview = (await sendTurn(ctx, { interview_id: interview.id, text: "Ready", mode: "voice" })).interview;
    interview = (await saveRating(ctx, { interview_id: interview.id, item_id: "ability", choice: "yes_with_guide" })).interview;
    expect(interview.pending_rating?.id).toBe("pace");
    return { ctx, interview };
  }

  it("saying “about right” at the pace item saves that rating", async () => {
    const { ctx, interview } = await atPace("farid");
    const res = await sendTurn(ctx, { interview_id: interview.id, text: "Um, I'd say about right", mode: "voice" });
    expect(res.interview.ratings.pace).toBe("about_right");
    expect(res.interview.pending_rating?.id).toBe("relevance");
    // In voice the Interviewer reads the choices out.
    expect(res.reply.text).toMatch(/You can say Most of it, Some of it, A little, None yet, or Prefer not to say/);
    const [turn] = await sql()`select mode, text from public.interview_turns where interview_id = ${interview.id} and role = 'learner' order by seq desc limit 1`;
    expect(turn).toEqual({ mode: "voice", text: "Um, I'd say about right" });
  });

  it("an unclear answer gets one clarifying question, and a second unclear one moves on", async () => {
    const { ctx, interview } = await atPace("grace");
    const first = await sendTurn(ctx, { interview_id: interview.id, text: "Hmm, it was a long day", mode: "voice" });
    expect(first.interview.pending_rating?.id).toBe("pace");
    expect(first.interview.ratings.pace).toBeUndefined();
    expect(first.reply.text).toMatch(/which is closest/i);
    const second = await sendTurn(ctx, { interview_id: interview.id, text: "I really couldn't tell you", mode: "voice" });
    expect(second.interview.ratings.pace).toBe("prefer_not_to_say");
    expect(second.interview.pending_rating?.id).toBe("relevance");
  });
});

describe("what is stored from voice", () => {
  it("interview_turns holds text only, and no audio is written to Storage", async () => {
    const cols = await sql()`select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'interview_turns'`;
    expect(cols.filter((c) => c.data_type === "bytea" || /audio|blob|file/.test(c.column_name))).toEqual([]);
    expect(cols.find((c) => c.column_name === "text")?.data_type).toBe("text");
    const audio = await sql()`select name from storage.objects where coalesce(metadata->>'mimetype', '') like 'audio/%' or name ~* '\.(wav|mp3|m4a|ogg|webm|opus|flac)$'`;
    expect(audio).toEqual([]);
    const buckets = await sql()`select id from storage.buckets order by id`;
    expect(buckets.map((b) => b.id)).toEqual(["documents", "logos"]);
  });
});
