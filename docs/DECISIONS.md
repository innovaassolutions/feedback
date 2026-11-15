# Decisions

Every choice the plan didn't make, one line each: the phase, what was decided, and why.

## Setup

- Setup: `PLAN-EXPLORER.md` wasn't in the working directory, so the first commit on `main` holds `PLAN.md` and `CLAUDE.md` only.
- Setup: the folder already held an earlier prototype ("Session Feedback": admin password, PGlite, the Anthropic SDK directly, `src/`). It doesn't match the plan's stack or layout, so it is kept on a local `prototype` branch and the build starts fresh on `build`. The older `docs/PLAN.md` draft is on that branch too.
- Setup: `main` and `build` were pushed once Todd confirmed the GitHub repository (`innovaassolutions/feedback`); the session's permission check had refused the first attempt.
- Setup: the prototype's `.env.local` is kept as `.env.prototype.local` (ignored by git).
- Setup: Next.js 16.4, React 19.3, Tailwind 4.3 (through `@tailwindcss/turbopack`, as the prototype had it), AI SDK 7, Supabase CLI 2.75, Vitest 5, Playwright 1.65.
- Setup: added libraries the plan doesn't name: `@ai-sdk/gateway` (the AI Gateway provider), `unpdf` and `mammoth` (PDF and DOCX text), `node-html-parser` and `robots-parser` (documentation sites), `nodemailer` (SMTP to the local inbox), `sharp` (logo colours), `qrcode`, `recharts` (named in the plan), `postgres` (catalog checks in tests), `jszip` and `pdf-lib` (test fixtures), `tsx`.

## Phase 1

- Phase 1: the 16 seeded users leave no room for separate organization admins, so one instructor in each seeded organization (Dana Whitfield, Owen Marsh) is also its `org_admin`.
- Phase 1: the platform admin is a flag in Supabase Auth's `app_metadata` (which users can't change), not a table, so every table can keep `organization_id`.
- Phase 1: `organizations.organization_id` is a generated column equal to `id`, so "every row carries organization_id" holds for that table too.
- Phase 1: branding for signed-out pages (the sign-in page) comes from a security-definer function, `get_branding(slug)`, rather than a readable table, so the tenancy test can hold for every table.
- Phase 1: Vitest and Playwright share a second local Supabase stack (ports 553xx, project `feedback-test`, generated from `supabase/config.toml` into `.test-stack/`), so tests never touch the dev database. Each run resets and seeds it.
- Phase 1: the e2e server is `next dev` on port 3100 with its own build directory (`NEXT_DIST_DIR=.next-e2e`), so it runs beside `npm run dev`.
- Phase 1: the magic-link email uses a token-hash link to `/auth/confirm`, so it works in any browser. Production needs the same template set in the Supabase dashboard.
- Phase 1: sign-in never creates accounts, and gives the same message whether or not the address exists, so it can't be used to find out who is enrolled.
- Phase 1: Tailwind's default colour palette is removed in `globals.css`, so a component can't use a colour that isn't a theme variable.
- Phase 1: the approved font list is eight Google fonts loaded with `next/font`: Inter, IBM Plex Sans, Source Sans 3, Nunito Sans, Work Sans, Merriweather, Source Serif 4, Lora.
- Phase 1: the Streamspace logo in the seed is a placeholder drawn for this build. Replace `scripts/assets/streamspace-logo.svg` with the real logo for the Live brand criterion.
- Phase 1: API routes are left out of `proxy.ts`, because the proxy buffers request bodies up to 10 MB and would cut off document uploads. Route handlers refresh the session themselves.
- Phase 1: a magic link returns to the address the person signed in from. The app sends `/auth/confirm?next=…` on that origin as the redirect, and the email template uses it, falling back to the site URL when Auth doesn't accept it. Redirects after confirm and sign-out use the Host header, since `request.url` says localhost in development.
- Phase 1: organization admins get Branding and Manage courses links on the organization page as well as Branding in the course header, because an admin of a new organization has no course yet and lands there.
- Phase 1: for trying the dev server on a phone, the local Auth allow list and `allowedDevOrigins` accept `*.local` names, and the browser's Supabase client swaps a loopback Supabase address for the page's host. Auth never redirects to non-loopback IP addresses, so an IP can't be used.

## Phase 2

- Phase 2: a session's feedback window is a course setting, `feedback_window_days` (default 7), added beside the plan's limits. Opening a session sets `closes_at`; the scheduled job closes it.
- Phase 2: the file type is decided from the bytes as well as the extension (PDF, DOCX zip, UTF-8 text, `WEBVTT`), so a renamed `.exe` is refused.
- Phase 2: invitations accept "Name <email>" as well as bare addresses; a bare address gets a name from its local part.
- Phase 2: creating a learner's account needs Supabase's admin API, so `invite_learners` uses the secret key in `lib/server/` for that one step. This is a fourth use beyond the three the plan lists.
- Phase 2: background work runs from a `jobs` table: `after()` processes it straight after the response, and Vercel Cron calls `/api/cron/tick` every 15 minutes for retries and scheduled work (`vercel.json`; a 15-minute cron needs a Pro plan).
- Phase 2: the Librarian re-drafts the brief whenever a document finishes reading, from all of the session's ready documents. The instructor's approved brief is kept separately and only it reaches the Interviewer.
- Phase 2: the QR code renders in the text colour on `bg-white`, because a QR code needs dark on light to scan.

- Phase 2: after a document is read, the documents panel keeps refreshing until the Librarian's brief draft arrives (for up to two minutes), so the draft appears without a reload.

## Phase 3

- Phase 3: all interview writes, named as well as anonymous, go through the server with the secret key, authorized by the interview token, so there is one code path.
- Phase 3: the token's cookie is `iv_<interview id without dashes>`, httpOnly, 24 hours. Only its SHA-256 hash is stored.
- Phase 3: each conversation topic has an `opener` in the guide, so a chip tap that ends the ratings can open the conversation without calling the model.
- Phase 3: an Interviewer turn returns structured output (`reply`, `topic_action`, `learner_declined`, `offered_to_post_question`) alongside its tools, so code can track topics and follow-ups.
- Phase 3: code enforces consent for `raise_question`: it only takes effect if the previous Interviewer turn offered to post the question.
- Phase 3: after one clarifying question, a second unclear rating answer is saved as "Prefer not to say" and the interview moves on, rather than asking again.
- Phase 3: the turn limit counts the learner's typed and spoken turns, not chip taps. At turn 14 the Interviewer moves to the read-back; turns 15–18 can correct the summary; turn 19 is refused.
- Phase 3: on submission, anonymous and private interviews have every timestamp (interview, turns, ratings, insights) cut to the date, and signed-in users are never granted the time columns.
- Phase 3: the completion row is written before the interview is marked submitted, so its unique key stops a double submission.
- Phase 3: private interviews also lose their confirmed summary when the Analyst finishes, not only their turns.
- Phase 3: the learner's one-tap rating of the interview is helpful / okay / not helpful, sent after submission.
- Phase 3: blockers are emailed to the course's instructors straight away.
- Phase 3: the judge model that scores the rubric isn't one of the four product agents. Its instructions are in `lib/server/quality/rubric.ts` with their own version (`JUDGE_VERSION`), and its runs are recorded as agent `judge`.
- Phase 3: a quote counts as word for word if it appears in a learner turn ignoring letter case, runs of spaces and curly quotes.
- Phase 3: the eval report records every agent's AGENT.md version, so the merge gate can check any of them.
- Phase 3: model reasoning defaults to `minimal` (`AI_REASONING` changes it) for every agent. On the first real-model runs Claude Sonnet 5.5 reasoned before answering, ran out of the fixed output budgets (the Interviewer's 600 tokens, the judge's 800) and failed the turn. `none` isn't available on Sonnet 5.5; `minimal` is its lowest level.
- Phase 3: after the first real-model eval (rubric 67.6%), more Interviewer rules moved into code: each stage offers only its own tools (no `save_rating` in the conversation, so chip ratings can't be overwritten); a turn has three steps and the last offers no tools, so it always ends in a reply; at most one blocker per turn; and `end_interview` only counts from a turn that produced a valid reply. A failed turn had ended two eval interviews after one answer.
- Phase 3: Interviewer `AGENT.md` 1.1.0 narrows a blocker to something the learner can't get past now (the model flagged "the settings were confusing"), calls `end_interview` only on an explicit request to stop, and asks about the last session's changes without suggesting they helped.
- Phase 3: Interviewer 1.2.0, after 1.1.0 scored 78.6%. In code: `end_interview` also needs `learner_asked_to_stop` in the same reply (the model still ended two eval interviews after ordinary answers); `raise_question` is offered only on the turn after an offer; a follow-up is allowed only while the turns left can still reach every pending topic. In `AGENT.md`: no two questions joined by "or", the last session's changes asked as an open question (the default guide's opener changed to match), and no talk of tools to the learner. The judge's output budget went from 800 to 1500 tokens.
- Phase 3: Interviewer 1.3.0, after 1.2.0 scored 75.7%. The context names the last session's changes as `feedback_from_learners` and `what_changed` instead of `you_said` and `we_did`: the model kept telling individual learners "last time you said…". `AGENT.md` frames them as the group's feedback and accepts "I can't compare". When a rating is unclear and the model's reply asks nothing, code asks which choice is closest.
- Phase 3: rubric judge 1.1.0. Its reasons have no length limit in the schema (they are trimmed to 300 characters when stored), and it gets a second try. A reason over 300 characters used to throw the verdict away and count the interview as failed; three of eight personas in one run. The rubric items and their wording are unchanged.
- Phase 3: Interviewer 1.4.0, after 1.3.0 scored 78.6% with six of its nine failures on one question. Every wording that described the last session's change (and the feedback behind it) was judged leading, because it suggests the change helped. The Interviewer now asks about the part of the session the change was meant to improve, without describing it ("How did you find the balance between explanation and practice this time?"). The answer still shows whether the change worked, and learners see what changed in the "You said, we did" list on the session page. The default guide's goal and opener for this topic changed to match.
- Phase 3: Interviewer 1.5.0. 1.4.0 passed the evals (97.7%), but in a live run on `npm run dev` it sent two blocker alerts with the summary "placeholder" for a problem the learner had already got past. On Sonnet 5.5's lowest reasoning setting the model thinks only between tool calls, so a first tool call comes before any thinking. A blocker alert now needs the tool call, `learner_is_blocked` in the reply written after it, and a summary that isn't a placeholder.
- Phase 3: in development `AGENT.md` files are read on every call, so an edit applies without restarting `npm run dev`. Production keeps them cached.
- Phase 3: the 15-minute limit counts time spent in the interview (`progress.active_seconds`), and a gap with no activity counts for at most five minutes. It used to count from the start, so the voice trial, resumed 37 minutes after an abandoned first try, was wrapped up on its first answer.
- Phase 3: Interviewer 1.6.0. At the read-back the model says whether the learner's reply is a correction or something else (a question, "can we start again?"). For anything else, code keeps the points exactly as they were and the learner gets a short answer; the voice trial's request to start again had been folded into the summary four times. A revision that fails says so instead of claiming the summary was updated.
- Phase 3: Interviewer 1.7.0, after a voice trial in which "I don't understand the question" skipped the item and a complaint about confusing questions was saved as "Prefer not to say". The model now says when the learner asked what a rating question means (`learner_asked_to_explain`). Code then explains the item once more without using up its one clarification, and saves no rating on that turn. The confused-beginner persona now does this once in the evals.
- Phase 3: when the learner reaches the read-back without saying anything in the conversation (stopping straight after the ratings, or running out of time in them), there is no model call. The summary is one point, "No comments beyond the ratings.". Asked to summarise nothing, a model wrote points about the interview itself ("You asked to stop the interview…"). Submission still needs a point, so the summary can't be empty.
- Phase 5: the voice is paced for learners with English as a second language. The first voice spoke at a median of 231 words a minute, and Vocal Bridge has no speed setting. So the voice is now ElevenLabs' Alice ("clear, engaging educator") on `eleven_multilingual_v2` with the "professional" style, and spoken rating choices are separate short sentences ("You can say: Too slow. About right. …"), because the voice pauses at a full stop. The 0 to 10 scale is read as "a number from 0 to 10", not eleven numbers. The agent also waits longer before deciding the learner has finished (end-of-turn 0.7). The target is a median of 150 words a minute or less, measured from the call log with `scripts/voice-pace.ts`.
- Phase 3: Interviewer 1.8.0 asks for short sentences, common words and no idioms, because many learners speak English as a second language and some hear the reply instead of reading it. The opening line ends "Tell me when you are ready to start." instead of the idiom "Ready when you are."
- Phase 5: the learner chooses voice or chat on the entrance screen, with two start buttons in place of "Start the interview" (one button when voice isn't configured). With voice, the microphone comes on at once, the welcome is read aloud, and the learner says they're ready instead of pressing Start. A tester had pressed the welcome step's Start button before the microphone and missed the welcome. Learners can still switch either way at any point.
- Phase 5: `AI_MODEL_INTERVIEWER_VOICE` can give spoken turns a faster model. Claude Haiku 5.5 was evaluated on Interviewer 1.6.0: median reply 1.8 s against Sonnet 5.5's 2.9 s, but rubric 83.7% against 97.7% (it ran out of turns before covering the topics in five of eight personas, and one read-back failed). It is not the default; voice uses Sonnet 5.5.
- Phase 5: a spoken correction at the read-back gets a one-line confirmation, because the points are on screen. Re-reading the whole summary took about 28 seconds after every sentence.
- Phase 5: no instant spoken acknowledgement. One was tried ("Got it." straight away, the reply on the same turn, with the agent accepting two responses per turn). In the next call, Vocal Bridge's own relay model spoke between the two, three times: two questions the Interviewer never asked and a goodbye. The learner found the interview incoherent. The agent is back to one response per turn, its prompt forbids speaking anything the app didn't send, and the thinking sound covers the wait.

## Phase 4

- Phase 4: aggregates come from a security-definer SQL function, `session_results`, that applies the group-size rule itself and returns rows ordered by value, so no individual row is readable below the threshold and nothing comes back in an order that could be matched to a learner.
- Phase 4: sponsors get tiles, charts, themes, the summary and actions. Blockers, suggestions and quotes are for instructors. A separate `GET /api/sessions/{id}/quotes` returns 404 to sponsors.
- Phase 4: "Able to apply", "Pace about right" and the response rate use all responses as the denominator; "Prefer not to say" counts as a response.
- Phase 4: the Net Promoter Score appears at ten or more numeric Recommend answers.
- Phase 4: "with the spread" for Recommend is shown as the range (lowest to highest) and the number of answers.
- Phase 4: the course routes are split into `(main)` (with the header) and `(print)` route groups, so the print view has no navigation.
- Phase 4: the summary number check reads digits and number words; "one" is left out because it is usually a pronoun.
- Phase 4: "You said, we did" items recorded on a session appear on the next session's page, and the Interviewer asks about them in that session's interviews.

## Phase 5

- Phase 5: the server decides the name sent to Vocal Bridge ("Learner", or a named learner's first name) and ignores the browser's.
- Phase 5: the microphone button asks for the microphone itself before connecting, so a refusal shows a notice instead of a failed connection.
- Phase 5: `VOCAL_BRIDGE_API_URL` overrides the Vocal Bridge address; tests point it at an unreachable port, so they never call the service.
- Phase 5: the voice button has a test seam, `window.__vocalBridgeFactory`, so the browser test can stand in for Vocal Bridge. It does nothing unless a script sets it.
- Phase 5: the Vocal Bridge agent was created through Vocal Bridge's REST API (`POST /api/v1/agents`, what `vb agent create` calls), since the CLI is pip-only. It is web-only, "Focused" style, AI Agent delegation to the browser, verbatim; `docs/VOICE.md` lists every setting.
- Phase 5: a question the agent hasn't spoken as a reply (the one waiting when voice starts, or the next after a chip tap) goes to Vocal Bridge as a `read_aloud` client action (app to agent, `respond`). In AI Agent mode the agent otherwise only speaks in answer to the learner, and the first trial was silent from the start. The agent also got explicit `model_settings`: created through the API without them, it had no voice.

## Phase 6

- Phase 6: a question goes to the instructor without a model call when no source passes the relevance threshold (0.35 with real embeddings, 0.3 with the stub's bag-of-words vectors, where one shared word in four scores about 0.2).
- Phase 6: when sources disagree, the AI answer is shown (labelled not reviewed) and the instructor is also emailed.
- Phase 6: writing a new instructor answer replaces the AI answer; verifying with changed text counts as an edit.
- Phase 6: instructor-written and verified answers are indexed as sources by a background job, so the secret key stays in job code.
- Phase 6: documentation pages belong to the organization and are searched for every course it runs. The crawler respects robots.txt, stays on the same host and under the address given, and stops at 500 pages.
- Phase 6: votes are private to the voter; the count is kept on the question by a trigger.
- Phase 6: the Librarian's last step offers no tools, so it answers from what it found. A real model searched six times and never answered.
- Phase 6: text read from documents and documentation pages drops the control characters Postgres text can't hold. docs.streamspace.ai has a page with a NUL character, and the whole read failed with 22P05.

## Phase 7

- Phase 7: the Brand designer sees the logo as a PNG (SVGs are rasterized) and the palette code extracts from it.
- Phase 7: contrast pairs checked: text, muted text and links (primary) on the background and on cards, and button text on the primary and accent colours, in both modes.
- Phase 7: an SVG logo with scripts, event handlers or embedded content is refused.
- Phase 7: approving an earlier theme restores it; there is no separate restore operation.
- Phase 7: organization creation and course creation are server actions on `/platform` and `/[org]/settings/courses`, since the plan lists no API operation for them.
- Phase 7: organization addresses can't use reserved paths (`platform`, `sign-in`, `auth`, `api`, …).
- Phase 7: the header shows the organization's logo on its own, without the name beside it, because a logo already carries the name. The logo's alt text is the name, so the home link is still announced by name. The name appears as text only when there is no logo. A logo that is only an icon would therefore show no name; if that matters, the brand settings could gain a "show the name beside the logo" option.

## Phase 8

- Phase 8: alerts are checked by the scheduled tick and sent at most once a day.
- Phase 8: reminders go to every enrolled learner without a completion, once each at 24 hours after opening and 24 hours before closing.
- Phase 8: the follow-up interview is held against the course's highest-numbered session, once that session has been delivered, and opens `follow_up_days` after its date. Learners are emailed once when it opens.
- Phase 8: retention deletes turns and the confirmed summary; ratings, insights and scores stay, since they carry no transcript.
- Phase 8: a learner's removal request runs through a security-definer function limited to rows that belong to `auth.uid()`; completion rows stay.
- Phase 8: instructors act on anonymous interviews (mark accuracy, analyse again) through sealed references: AES-GCM with a fresh IV each time, so the page never holds an id and references can't be matched up.
- Phase 8: the labelled-set candidate list shows course, session and Analyst version. Adding a transcript to the eval set is a manual step that needs the instructor's agreement.
- Phase 8: CI pins the Supabase CLI to 2.75.0, the local version, because the latest (3.1) rejects the `[inbucket]` section of `supabase/config.toml`. Moving to 3.x means renaming that section to `[local_smtp]` and checking the test-stack script.

## Proposed plan changes

- Phase 3: the conversation topic "whether the last session's changes helped" pulls against "no leading questions". Asked that way it suggests the changes helped, and the rubric judge fails it. Suggest "how the last session's changes worked for the learner", which is what the Interviewer now asks. Many learners also can't compare with a session they missed, so the topic could be skipped for learners who didn't take the previous interview.
- On Vercel a function's request body is limited to 4.5 MB, so `add_document` can't receive a 25 MB file there. Large uploads should go straight to Supabase Storage with a signed upload URL, and `add_document` should take the stored path. Locally the limit works as written.
- `PLAN-EXPLORER.md` is referenced but wasn't supplied.
- The tenancy criterion ("zero rows from every table") rules out a readable branding table; the plan could say that public branding comes from a function.
- "Write the Interviewer and Analyst AGENT.md" doesn't mention the session summary task; it lives in the Analyst's AGENT.md here.
