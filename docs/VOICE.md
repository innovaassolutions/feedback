# Voice

## Status of the first Live check

**Not yet run.** Phase 5's first criterion asks for a short trial against the real Vocal Bridge service: every spoken turn reaches `send_turn`, every reply is spoken word for word, and whether audio recording can be turned off. The trial needs someone speaking into a microphone, so it hasn't happened yet.

What is in place (2026-11-15): Todd's account key is in `.env.local`, the agent below exists, and the app's own token call (`mintVoiceToken`) gets a token for it. Everything below is how the integration is built and what to check when the trial is run.

## How voice works in the app

- The chat window has a microphone button (`components/interview/voice.tsx`). Voice and typing share one interview, one transcript and one Interviewer.
- Pressing it first asks the browser for the microphone. If that's refused, a notice appears and typing carries on.
- The browser then uses `@vocalbridgeai/sdk` (the client underneath `@vocalbridgeai/react`) with `auth.tokenUrl` set to `/api/interviews/{id}/voice-token`.
- That route (`get_voice_token`) checks the interview token cookie (401 without it) and mints a short-lived token from `https://vocalbridgeai.com/api/v1/token` with `X-API-Key: VOCAL_BRIDGE_API_KEY` and, if set, `X-Agent-Id: VOCAL_BRIDGE_AGENT_ID`. The key is read only in `lib/server/voice.ts`.
- The participant name sent to Vocal Bridge is decided on the server: "Learner" for anonymous and private interviews, the learner's first name for named ones.
- Vocal Bridge runs in its AI Agent mode. Each transcribed utterance arrives through `onAIAgentQuery`; the app sends it to `send_turn` with `mode: "voice"` and returns the Interviewer's reply text, which Vocal Bridge speaks. Live `transcript` events for the learner fill a provisional chat bubble while they speak.
- Spoken turns are stored as text with `mode = 'voice'` and shown with a microphone mark. No audio is written to the database or to Storage.
- If the token can't be minted or the connection fails, the button turns off and a notice says voice isn't available.

## The Vocal Bridge agent

**Course Feedback Interviewer**, id `932ddd03-f2b1-4cbf-bf7d-09bc5a22b5b6`, set as `VOCAL_BRIDGE_AGENT_ID`. It was created on 2026-11-15 with `POST https://vocalbridgeai.com/api/v1/agents` (the REST call the pip CLI's `vb agent create` makes; the CLI itself isn't installed). An account key has to name the agent, so the `X-Agent-Id` header is required, not optional.

| Setting | Value sent | Why |
| --- | --- | --- |
| `mode` | `cascaded_concierge` (the dashboard's "Focused" style) | Speech to text, then text to speech of the reply. Vocal Bridge says verbatim delivery is only best effort in "Chatty" |
| `deploy_targets` | `web` | No phone number is provisioned or billed |
| `ai_agent_config` | `enabled: true`, `verbatim: true`, no endpoint URL, `response_delivery.mode: single` | With no endpoint URL, Vocal Bridge delegates to the browser, which is `onAIAgentQuery` in the app. One reply per turn, spoken as written |
| `prompt` | Relay only: send the learner's exact words to the AI agent, speak its reply word for word, add nothing, wait out mid-sentence pauses | The Interviewer in the app writes every reply |
| `greeting` | None | The Interviewer's opening message comes from the app |
| `background_enabled`, `web_search_enabled` | `false` | Vocal Bridge must not answer anything itself |
| `hold`, `transfer`, `hangup`, DTMF, `debug_mode` | `false` | Not needed on the web |
| Call recording / audio retention | Not exposed by the API at creation. To check in the dashboard during the trial | The plan wants no audio kept |
| Transcript retention on Vocal Bridge's side | To check in the dashboard during the trial | |
| Language | Vocal Bridge's default (English) | The plan's default |

The token response names the LiveKit address `livekit_url`. The SDK accepts that or `url`, and the app passes the response through unchanged.

## The trial to run

1. Set `VOCAL_BRIDGE_API_KEY` (and `VOCAL_BRIDGE_AGENT_ID` if the account has several agents) in `.env.local`, then run `npm run dev`.
2. Sign in as a seeded learner, open Session 1's interview, choose Anonymous, and press the microphone.
3. Speak ten turns, including rating answers ("about right", "eight"), a long answer, a pause mid-sentence, and a content question.
4. Check: every utterance appears as a microphone-marked bubble and as an `interview_turns` row with `mode = 'voice'`; every reply is spoken exactly as shown in the chat; the Vocal Bridge dashboard's participant name is "Learner".
5. Check the dashboard for audio recording settings and whether recordings exist for the trial session.
6. Record the result here: what passed, the exact settings used, whether recording can be turned off, and which languages the agent supports (open decision 9).
