# Voice

## Status of the first Live check

**Not yet run.** Phase 5's first criterion asks for a short trial against the real Vocal Bridge service: every spoken turn reaches `send_turn`, every reply is spoken word for word, and whether audio recording can be turned off. This build had no Vocal Bridge account or API key, so the trial hasn't happened. Everything below is how the integration is built and what to check when it is run.

## How voice works in the app

- The chat window has a microphone button (`components/interview/voice.tsx`). Voice and typing share one interview, one transcript and one Interviewer.
- Pressing it first asks the browser for the microphone. If that's refused, a notice appears and typing carries on.
- The browser then uses `@vocalbridgeai/sdk` (the client underneath `@vocalbridgeai/react`) with `auth.tokenUrl` set to `/api/interviews/{id}/voice-token`.
- That route (`get_voice_token`) checks the interview token cookie (401 without it) and mints a short-lived token from `https://vocalbridgeai.com/api/v1/token` with `X-API-Key: VOCAL_BRIDGE_API_KEY` and, if set, `X-Agent-Id: VOCAL_BRIDGE_AGENT_ID`. The key is read only in `lib/server/voice.ts`.
- The participant name sent to Vocal Bridge is decided on the server: "Learner" for anonymous and private interviews, the learner's first name for named ones.
- Vocal Bridge runs in its AI Agent mode. Each transcribed utterance arrives through `onAIAgentQuery`; the app sends it to `send_turn` with `mode: "voice"` and returns the Interviewer's reply text, which Vocal Bridge speaks. Live `transcript` events for the learner fill a provisional chat bubble while they speak.
- Spoken turns are stored as text with `mode = 'voice'` and shown with a microphone mark. No audio is written to the database or to Storage.
- If the token can't be minted or the connection fails, the button turns off and a notice says voice isn't available.

## Vocal Bridge agent settings to use

Configure these in the Vocal Bridge dashboard (the plan avoids the pip-installed CLI):

| Setting | Value |
| --- | --- |
| Agent mode | AI Agent (responses come from the app through `onAIAgentQuery`) |
| Speak the response | Word for word, with no rewording or summarising by Vocal Bridge |
| Opening greeting | None: the Interviewer's messages come from the app |
| Call recording / audio retention | Off, if the dashboard offers it (to confirm in the trial) |
| Transcript retention on Vocal Bridge's side | As short as the dashboard allows (to confirm in the trial) |
| Language | English (the plan's default) |

## The trial to run

1. Set `VOCAL_BRIDGE_API_KEY` (and `VOCAL_BRIDGE_AGENT_ID` if the account has several agents) in `.env.local`, then run `npm run dev`.
2. Sign in as a seeded learner, open Session 1's interview, choose Anonymous, and press the microphone.
3. Speak ten turns, including rating answers ("about right", "eight"), a long answer, a pause mid-sentence, and a content question.
4. Check: every utterance appears as a microphone-marked bubble and as an `interview_turns` row with `mode = 'voice'`; every reply is spoken exactly as shown in the chat; the Vocal Bridge dashboard's participant name is "Learner".
5. Check the dashboard for audio recording settings and whether recordings exist for the trial session.
6. Record the result here: what passed, the exact settings used, whether recording can be turned off, and which languages the agent supports (open decision 9).
