// Mints short-lived Vocal Bridge tokens. The API key is read only here and never reaches the
// browser. The participant name is decided on the server: "Learner" unless the interview is named.

export type VoiceToken = { url: string; token: string; room_name: string; participant_identity: string; expires_in: number; agent_mode?: string };

export class VoiceUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceUnavailable";
  }
}

export function voiceConfigured(): boolean {
  return Boolean(process.env.VOCAL_BRIDGE_API_KEY);
}

export async function mintVoiceToken(participantName: string, sessionId: string, fetcher: typeof fetch = fetch): Promise<VoiceToken> {
  const key = process.env.VOCAL_BRIDGE_API_KEY;
  if (!key) throw new VoiceUnavailable("Voice isn't set up");
  const base = process.env.VOCAL_BRIDGE_API_URL || "https://vocalbridgeai.com";
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-API-Key": key };
  if (process.env.VOCAL_BRIDGE_AGENT_ID) headers["X-Agent-Id"] = process.env.VOCAL_BRIDGE_AGENT_ID;
  let res: Response;
  try {
    res = await fetcher(`${base}/api/v1/token`, {
      method: "POST",
      headers,
      body: JSON.stringify({ participant_name: participantName, session_id: sessionId }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new VoiceUnavailable("The voice service can't be reached");
  }
  if (!res.ok) throw new VoiceUnavailable(`The voice service returned ${res.status}`);
  const body = (await res.json()) as VoiceToken;
  if (!body?.token) throw new VoiceUnavailable("The voice service returned no token");
  return body;
}
