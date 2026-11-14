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

## Phase 2

- Phase 2: a session's feedback window is a course setting, `feedback_window_days` (default 7), added beside the plan's limits. Opening a session sets `closes_at`; the scheduled job closes it.
- Phase 2: the file type is decided from the bytes as well as the extension (PDF, DOCX zip, UTF-8 text, `WEBVTT`), so a renamed `.exe` is refused.
- Phase 2: invitations accept "Name <email>" as well as bare addresses; a bare address gets a name from its local part.
- Phase 2: creating a learner's account needs Supabase's admin API, so `invite_learners` uses the secret key in `lib/server/` for that one step. This is a fourth use beyond the three the plan lists.
- Phase 2: background work runs from a `jobs` table: `after()` processes it straight after the response, and Vercel Cron calls `/api/cron/tick` every 15 minutes for retries and scheduled work (`vercel.json`; a 15-minute cron needs a Pro plan).
- Phase 2: the Librarian re-drafts the brief whenever a document finishes reading, from all of the session's ready documents. The instructor's approved brief is kept separately and only it reaches the Interviewer.
- Phase 2: the QR code renders in the text colour on `bg-white`, because a QR code needs dark on light to scan.

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

## Phase 6

- Phase 6: a question goes to the instructor without a model call when no source passes the relevance threshold (0.35 with real embeddings, 0.3 with the stub's bag-of-words vectors, where one shared word in four scores about 0.2).
- Phase 6: when sources disagree, the AI answer is shown (labelled not reviewed) and the instructor is also emailed.
- Phase 6: writing a new instructor answer replaces the AI answer; verifying with changed text counts as an edit.
- Phase 6: instructor-written and verified answers are indexed as sources by a background job, so the secret key stays in job code.
- Phase 6: documentation pages belong to the organization and are searched for every course it runs. The crawler respects robots.txt, stays on the same host and under the address given, and stops at 500 pages.
- Phase 6: votes are private to the voter; the count is kept on the question by a trigger.

## Phase 7

- Phase 7: the Brand designer sees the logo as a PNG (SVGs are rasterized) and the palette code extracts from it.
- Phase 7: contrast pairs checked: text, muted text and links (primary) on the background and on cards, and button text on the primary and accent colours, in both modes.
- Phase 7: an SVG logo with scripts, event handlers or embedded content is refused.
- Phase 7: approving an earlier theme restores it; there is no separate restore operation.
- Phase 7: organization creation and course creation are server actions on `/platform` and `/[org]/settings/courses`, since the plan lists no API operation for them.
- Phase 7: organization addresses can't use reserved paths (`platform`, `sign-in`, `auth`, `api`, …).

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

- On Vercel a function's request body is limited to 4.5 MB, so `add_document` can't receive a 25 MB file there. Large uploads should go straight to Supabase Storage with a signed upload URL, and `add_document` should take the stored path. Locally the limit works as written.
- `PLAN-EXPLORER.md` is referenced but wasn't supplied.
- The tenancy criterion ("zero rows from every table") rules out a readable branding table; the plan could say that public branding comes from a function.
- "Write the Interviewer and Analyst AGENT.md" doesn't mention the session summary task; it lives in the Analyst's AGENT.md here.
