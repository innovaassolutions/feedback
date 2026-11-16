# Status

**All eight phases are built.** 80 of the plan's 85 criteria are verified and ticked. The five that aren't are Live criteria: two voice trials need a person speaking (the Vocal Bridge key and agent are set up and checked), and three need the client's real Session 1 rebuild guide or Streamspace logo. See [Not yet verified](#not-yet-verified).

Last checked on 16 November 2026: `npm run check` passes (type check, lint, 162 Vitest tests in 19 files) and `npm run e2e` passes (28 Playwright tests) while `npm run dev` is running.

**Production** runs at https://feedback.innovaas.co (see [Deploying](#deploying)). The user guide is at `/docs`. `npm run evals` passes against the real model (16 November 2026: rubric 90.7%, themes 95.8%, Librarian 8 of 8). The rubric was 97.7% on the run before with the same Interviewer; persona runs vary, and this one was close to the 90% mark.

## What's built

| Phase | What it adds |
| --- | --- |
| 1. Tenancy, sign-in and course pages | Schema for all 22 tables with Row Level Security from the first migration; magic-link sign-in; roles; seed data for Streamspace and Northwind Academy; branded course and session pages; the test stack |
| 2. Instructor administration | Sessions and their states, document upload and reading (PDF, DOCX, Markdown, text, VTT), the Librarian's draft brief and its approval, the roster and invitations, the join link and QR code |
| 3. Interviewer and Analyst, in chat | The staged interview (consent → ratings → conversation → read-back) with chips, the three anonymity levels, the Analyst with quote and theme checks, the interview guide editor, the eval sets |
| 4. Feedback dashboard | Tiles, charts with table views, the session summary with its number check, the small-group rule, transcripts, "You said, we did", the print report |
| 5. Voice | The microphone in the chat window through Vocal Bridge, server-minted tokens, the fallbacks when voice isn't available |
| 6. Session Q&A | The live Q&A board, the Librarian's cited answers, documentation sites, verified answers as sources, the Q&A tile |
| 7. Branding and a new tenant | The Brand designer, contrast adjustment, the preview and approval page, theme history, organization and course creation |
| 8. Quality, reminders and follow-up | `agent_runs` for every agent call, the rubric job, the quality page, alerts, the review queue and labelled-set candidates, the eval merge gate in CI, reminders, the follow-up interview, retention and a learner's removal request |
| After the build: user guide | A user guide at `/docs`, built with Fumadocs from the MDX pages in `content/docs`: sign-in, the learner's interview, anonymity, voice, Q&A, the dashboard, transcripts, running a course, branding, platform administration, the agents, privacy, settings and an FAQ. It uses the platform theme's colors, has search, and is linked as Help in every course header |
| After the build: branded emails | Every email uses its organization's live theme: sign-in links and invitations, reminders, the follow-up invitation, blocker alerts and questions for instructors (`lib/server/mail/`). Sign-in emails come through Supabase Auth's send-email hook (`/api/auth/send-email`); logos are served to mail apps as PNGs (`/api/email-logo/<slug>.png`). The quality alert uses the platform's look |
| After the build: the Librarian correlates sources | Librarian 1.1.0. Its search knows the session a question was asked on and returns each kind of source separately (`match_chunks_grouped`): this session's documents and transcript, other sessions', the product documentation and verified answers, each labelled, so a transcript can't crowd out the documentation. Its instructions say what each is the authority on and to flag where the session and the documentation differ. SRT transcripts are accepted. A third eval set checks it (`evals/librarian.ts`). Documents upload straight to Storage, so the 25 MB limit holds in production |
| After the build: course setup | Course setup shows a course as a series of sessions, each with its setup progress, and a session's page as three ordered steps. **Admin** became **Course setup**; state buttons say what they do |
| After the build: editing | Courses, sessions, documents, learners, people, documentation sites and the organization can be renamed or corrected, and courses and sessions deleted while they hold no learner feedback (`lib/server/ops/editing.ts`, the Course details tab, Edit details on a session). Organization admins can create courses (a bug fix) |
| After the build: people and invitations | Organization admins add organization admins, instructors and sponsors on `/<org>/settings/people`; platform admins add platform admins on `/platform` (`lib/server/ops/people.ts`). A person's first email is an invitation naming the course and what their role lets them do. The roster resends an invitation to an enrolled learner who hasn't signed in, and lists any it couldn't send. The organization and course forms' Web address field fills in from the name and explains itself |

The four product agents are in `agents/`, each with `AGENT.md` (the Interviewer at 1.8.0, the others at 1.0.0), `tools.ts`, `schema.ts`, `evals/`, the agent's code and its stub. Rules that must always hold are in code: the Interviewer's stages, turn and time limits, topic tracking, which tools each turn offers, and the double checks on ending early and on blocker alerts (`agents/interviewer/engine.ts`), anonymity (the schema, column grants and `lib/server/ops/interviews.ts`), quote and theme checks (`agents/analyst/validate.ts`), citation checks (`agents/librarian/answer.ts`), the summary number check (`agents/analyst/summary.ts`) and contrast (`lib/theme/adjust.ts`).

## How to run it

Needs Node 20.9 or later, Docker running, and the Supabase CLI (built with 2.75).

```bash
npm install
# supabase start needs SEND_EMAIL_HOOK_SECRET in supabase/.env, and .env.local needs the same value (see .env.example)
supabase start -x studio,imgproxy,vector,logflare,supavisor,edge-runtime   # Postgres, Auth, Storage, Realtime and the mail inbox; -x skips services the app doesn't use
supabase status -o env         # copy the URL and keys into .env.local (see .env.example)
npm run db:reset               # rebuild and seed: "Seeded 2 organizations, 2 courses, 4 sessions and 16 users"
npm run seed:demo              # seven submitted interviews on Session 1 (3 named, 3 anonymous, 1 private)
npm run dev                    # http://localhost:3000
npm run jobs                   # optional: run the scheduled work once (reminders, alerts, retention…)
```

Linking the folder to the production project (`supabase link`, or `db push --linked`) makes the CLI pin local services to production's versions in `supabase/.temp/`. Production's Auth (v2.197) rejected this CLI's (2.75) local secret key with "signing method HS256 is invalid", so `supabase/.temp/gotrue-version` was deleted and the local stack restarted. If admin calls fail locally after a push, delete it again.

Sign in at `http://localhost:3000/streamspace/sign-in` with a seeded address and open the link from the local inbox at `http://localhost:54324`. Auth hands sign-in emails to the app (`/api/auth/send-email`) to send in the organization's branding, so they arrive only while `npm run dev` is running. Everyone is fictional; addresses use the reserved `.example` domain.

**Trying it on a phone.** Phone and computer must be on the same network. Open the app on the computer at its `.local` name rather than `localhost` (find the name with `scutil --get LocalHostName`, then use `http://<name>.local:3000`), sign in there, and the session page's QR code points at that address. The learner's sign-in email links back to the same address, and the phone can read the local inbox at `http://<name>.local:54324`. An IP address such as `192.168.1.20` doesn't work: Supabase Auth refuses to redirect to IP addresses other than loopback. iPhones resolve `.local` names; some Android phones don't. Voice needs HTTPS on a phone, so over the local network the interview is typed only.

| Who | Address | Role |
| --- | --- | --- |
| Sam Rivera | sam.rivera@platform.example | Platform admin (`/platform`) |
| Dana Whitfield | dana.whitfield@streamspace.example | Streamspace organization admin and instructor |
| Marcus Lindqvist | marcus.lindqvist@streamspace.example | Instructor |
| Priya Raman | priya.raman@ime-engineering.example | Sponsor |
| Aisha Bello, Ben Carter, Chloe Nakamura, Diego Alvarez, Elena Petrova, Farid Haddad, Grace Liu, Hamish Doyle | first.last@ime-engineering.example | Learners |
| Owen Marsh | owen.marsh@northwind.example | Northwind organization admin and instructor |
| Isla Brennan, Kofi Mensah, Lena Vogel | first.last@northwind.example | Northwind learners |

**Without `AI_GATEWAY_API_KEY`, every agent runs on its built-in stub**: simple, rule-based behaviour that follows each `AGENT.md` closely enough to exercise the real code around it. With a gateway key the agents use real models: `anthropic/claude-sonnet-5.5` by default and `openai/text-embedding-3-small` for embeddings, both checked against the gateway's model list. The gateway's free tier allows neither, so it needs credits. `AI_REASONING` sets how much the model reasons before answering (default `minimal`). In development an edit to an `AGENT.md` applies without restarting `npm run dev`.

## Tests

- `npm run check`: `next typegen`, the type check, lint and Vitest. Vitest starts a second local Supabase stack if needed (ports 553xx, files in `.test-stack/`), resets and seeds it, and runs every file in turn against it.
- `npm run e2e`: Playwright against its own `next dev` on port 3100 and the same test stack, so it works while `npm run dev` runs on port 3000. The browser uses a fake microphone; voice tests stand in for Vocal Bridge.
- Don't run `npm run check` and `npm run e2e` at the same moment: they share the test stack and reset it.
- Tests never call a model, Vocal Bridge or a real email service.

Beyond the automated suites, the criteria the plan words in terms of the dev server were also checked against `npm run dev` on a freshly seeded database: the Phase 1 sign-in, session lists, Admin link, "Course not found" and header colours; the Phase 2 uploads, learner materials, signed downloads and three invitation emails in the local inbox; the Phase 4 demo figures (Responses 7 of 8, Able to apply 5 of 7, Pace about right 4 of 7, Recommend 7.7, no NPS) and the sponsor's 404s; "You said, we did" on the learner's Session 2 page; the Q&A tile; the quality page; and an alert email reaching the platform admin's inbox.

## Evals

```bash
npm run evals                 # both eval sets against the real model; needs AI_GATEWAY_API_KEY
npm run evals -- --stub       # a dry run against the stub, to check the harness; not valid for the gate
npm run evals:gate -- --base origin/main   # what CI runs: every changed AGENT.md needs a passing report
```

`npm run evals` plays eight scripted learner personas against the real Interviewer and scores each transcript on the rubric (limits and coverage in code, the rest by a judge model), then runs the Analyst on twelve hand-labelled transcripts. Pass marks: 90% of rubric items, 85% theme agreement. Reports go to `evals/reports/` with every agent's `AGENT.md` version.

**Latest eval results (15 November 2026, Claude Sonnet 5.5 through the AI Gateway): rubric 97.7%, themes 95.8%, median Interviewer reply 2.4 s (90th percentile 6.4 s)**, for Interviewer 1.8.0 and Analyst 1.0.0, scored by judge 1.1.0. The report is `evals/reports/2026-11-15T10-02-10-215Z-model-interviewer-1.8.0-analyst-1.0.0.json`. Reports now include the Interviewer's reply time. Stub reports are ignored by git and by the gate.

The Interviewer took six versions to pass, and has changed since after voice trials. Every report is kept in `evals/reports/`:

| Interviewer | Rubric | What the run showed, and what changed next |
| --- | --- | --- |
| 1.0.0 | 67.6% | The model's reasoning used up the 600-token turn budget, turns failed, and a failed turn could still end the interview. Reasoning set to minimal; each stage offers only its own tools; the last step offers none; a failed turn can't end the interview; one blocker per turn |
| 1.1.0 | 78.6% | `end_interview` called after ordinary answers. It now also needs `learner_asked_to_stop` in the reply; follow-ups only while every topic can still be reached |
| 1.2.0 | 75.7% | The judge itself failed on three personas (its 300-character reason limit), fixed in judge 1.1.0. The Interviewer told learners "last time you said…" |
| 1.3.0 | 78.6% | Six failures, all on describing the last session's change, which the judge reads as leading |
| 1.4.0 | 97.7% | Passed, but a live run sent blocker alerts with the summary "placeholder". A blocker alert now also needs `learner_is_blocked` in the reply and a real summary |
| 1.5.0 | 100% | The voice trial showed requests at the read-back ("can we start again?") folded into the summary. The read-back now tells corrections from anything else |
| 1.6.0 | 97.7% | Also run with Claude Haiku 5.5 for speed: 83.7%, so voice stays on Sonnet 5.5. A voice trial then showed "I don't understand the question" skipping the item, a complaint saved as "Prefer not to say", and a summary about the interview itself after an early stop |
| 1.7.0 | 97.7% | A rating question the learner didn't understand is explained once more, and no rating is saved on that turn. The confused beginner now asks once: the explanation worked, but with two explanations and a Q&A offer the persona reached the 14-turn limit before the last topic, its one miss |
| 1.8.0 | 97.7% | Short sentences, common words and no idioms, for learners with English as a second language. The one miss moved to the non-native persona, which reached the 14-turn limit before the last topic |

Theme agreement stayed between 93.8% and 95.8% on Analyst 1.0.0 throughout.

## Deploying

Production was set up on 16 November 2026, at Todd's request, with no demo data: it starts empty apart from the platform admin, and the real organization is created through `/platform`.

- **Address:** https://feedback.innovaas.co, a custom domain on the Vercel project. The project's `*.vercel.app` addresses need a Vercel login (its protection setting is "all except custom domains"). The DNS record is an `A` record `feedback → 76.76.21.21` at Cloudflare, DNS only.
- **Vercel:** project `feedback` in the Innovaas Solutions team (Pro, so the 15-minute cron runs). Functions run in `sin1` (Singapore), next to the database (`vercel.json`). Production was deployed from the `build` branch with `vercel deploy --prod`; the project's production branch is `main`, so once Todd merges, pushes to `main` deploy.
- **Environment variables (production):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_APP_URL`, `AI_GATEWAY_API_KEY`, `VOCAL_BRIDGE_API_KEY`, `VOCAL_BRIDGE_AGENT_ID`, `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `EMAIL_FROM=Course Feedback <feedback@innovaas.co>`, `CRON_SECRET`, `REVIEW_REF_SECRET` and `SEND_EMAIL_HOOK_SECRET` (all three generated for production; the hook secret is also kept in `.env.prod` for config pushes). Preview deployments have none, so they don't touch production data. Copy `SUPABASE_SECRET_KEY` from the Supabase dashboard (Project Settings → API Keys): `supabase projects api-keys` shows a secret key only masked, as `sb_secret_` and five characters followed by dots.
- **Supabase:** project `feedback` (ref `oxtyoohphjfsohoiivto`, Singapore). `supabase db push` applied every migration. Auth was set with `supabase config push` from a copy of `supabase/config.toml` with these production values: site URL and redirect URLs on https://feedback.innovaas.co; sign-ups off (accounts come only from invitations); the magic-link template from `supabase/templates/magic_link.html`; SMTP through Resend (`smtp.resend.com:465`, user `resend`, the Resend key, sender `feedback@innovaas.co`); 100 emails an hour; one email per address a minute; 100 sign-in requests and verifications per IP per five minutes, so a classroom behind one network can sign in together; and the send-email hook on `https://feedback.innovaas.co/api/auth/send-email`, so sign-in emails go out from the app in the organization's branding (the SMTP settings stay as Auth's fallback). To repeat it, copy `supabase/config.toml`, change those values, and run `supabase config push --project-ref oxtyoohphjfsohoiivto --workdir <copy>` with `RESEND_API_KEY` (without quotes) and `SEND_EMAIL_HOOK_SECRET` (from `.env.prod`) set. A production sign-in email was checked end to end on 16 November 2026 with a temporary account on Resend's test address, deleted afterwards: Auth → hook → Resend took about a second and Resend reported it delivered.
- **Platform admin:** `FEEDBACK_ENV_FILE=.env.prod npx tsx scripts/create-platform-admin.ts <email>` creates the account, or makes an existing one a platform admin. Everything else is created in the app. `.env.prod` is a git-ignored local file holding the production `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `NEXT_PUBLIC_APP_URL`. Next.js and Vitest never load a file with that name, so dev and tests stay on the local database; keep `.env.local` on the local stack.
- **Email:** Resend, on the verified `innovaas.co` domain. Resend's free plan sends 100 emails a day, which a large invitation can reach.
- **Large uploads:** the browser stores a document straight in Storage (the storage rules let only the course's managers write to its folder), then `register_document` checks the stored bytes and records it, so files up to 25 MB arrive although a Vercel function accepts at most 4.5 MB.

## Not yet verified

| Criterion | Why not | What it needs |
| --- | --- | --- |
| Phase 2, Live: the drafted brief from the Session 1 rebuild guide names Get Document Data, Core Agent and Link Generator | The real rebuild guide isn't in the repository | Upload the guide to Session 1 as an instructor and read the draft on the admin session page |
| Phase 5, Live first: the voice trial | Needs a person speaking. The key, the agent and token minting are in place and checked | Run the trial in `docs/VOICE.md` on `localhost:3000` |
| Voice pace for learners with English as a second language (not a plan criterion) | The voice was changed on 15 November 2026 after measuring 231 words a minute, and no call has been made since | A voice call, then `npx tsx scripts/voice-pace.ts`: the median should be 150 or less |
| Phase 5, Live: a full voice interview in Chrome on a laptop and in a phone browser | Needs a person speaking; the phone also needs HTTPS | As above, on both devices (the phone needs the app reachable over HTTPS) |
| Phase 6, Live: "How do I find my project ID?" answered from the rebuild guide | The real rebuild guide isn't in the repository | The guide on Session 1, then ask the question as a learner |
| Phase 7, Live: the Streamspace logo gives a blue primary that passes every contrast pair | The seeded logo is a placeholder | The real logo, uploaded on `/streamspace/settings/brand` |
| Production sign-in by email (not a plan criterion) | Production was set up on 16 November 2026. A sign-in link has to reach a real inbox | Todd signs in at https://feedback.innovaas.co with his platform admin address and confirms the link arrives from feedback@innovaas.co and signs him in |
| Voice in production (not a plan criterion) | As the voice trial above | The same trial on https://feedback.innovaas.co, which also gives the phone check the HTTPS it needs |

Live criteria verified on 15 November 2026 against `npm run dev` and the real model:
- **Phase 3, a full interview.** A scripted learner took Session 1 in a browser, typing instantly. On Interviewer 1.5.0 it covered every topic in 0.4 minutes with model replies of 2–5 seconds. The read-back named Get Document Data, Core Agent, Link Generator and the project ID, the insights named four themes, and no blocker alert went out. A person typing would take a few minutes.
- **Phase 3, the evals.** See [Evals](#evals).
- **Phase 6, documentation.** `docs.streamspace.ai` was read as 38 pages. "How do I publish a new version of a workflow?" got an AI answer citing three sections of its "Test, Debug & Publish Workflows" page, each marked Documentation. The first read failed because one page holds a NUL character, which Postgres text can't store; fixed in `lib/server/librarian/chunk.ts`.

These runs added invented learners (Jonah Ellery, Rowan Pike, Tessa Lund, Noel Brandt) to the local database only, because every seeded learner had already given Session 1 feedback there. `npm run db:reset` removes them.

Verified with a stand-in rather than the real service: Phase 5's browser criterion (microphone permission, spoken turns as microphone-marked bubbles, switching back to typing) ran in Chromium with a fake microphone and a stand-in for the Vocal Bridge client. The real service is covered by the two Live voice criteria above.

## Git

- `main` holds the first commit (`PLAN.md`, `CLAUDE.md`). `build` holds the phase commits. A local `prototype` branch keeps the earlier "Session Feedback" app that was in the folder.
- `main` and `build` are pushed to `github.com/innovaassolutions/feedback`; `main` is the default branch. The `prototype` branch stays local.
- The first CI run on `build` (run 43597848050) showed the eval gate working: the "Eval report for every changed `AGENT.md`" job failed, naming all four agents at 1.0.0 with no passing real-model report. The 15 November report passes the gate for all four agents (`npm run evals:gate -- --base origin/main`).
- That run's check job also failed, for a different reason: CI installed the latest Supabase CLI (3.1), which no longer accepts the `[inbucket]` section of `supabase/config.toml`. CI now pins the CLI to 2.75.0, the version this repository was built and tested with.
- The code for all eight phases was written before the local database finished downloading (about 90 minutes on this connection), then verified together. The phase commits group the files by phase, so only the last commit, which is the verified tree, is guaranteed to pass `npm run check` and `npm run e2e` on its own.

## Closing notes

**What was built.** Everything in the plan's eight phases: the multi-tenant app on Next.js and Supabase with Row Level Security on every table, four agents behind the Vercel AI SDK with versioned instructions, schemas, stubs and evals, the dashboard, Q&A, voice, branding, quality monitoring, reminders, the follow-up interview and retention.

**Still unverified.** The five Live criteria in the table above. Two need a person to run the voice trial; three need the client's real rebuild guide or logo.

**Decisions.** About 70 choices the plan didn't make are in `docs/DECISIONS.md`. The ones Todd is most likely to want to revisit:
- one instructor per seeded organization doubles as its admin;
- aggregates come from security-definer SQL functions, so the group-size rule holds even against direct API reads;
- every timestamp on anonymous and private interviews is cut to the date;
- the Interviewer returns structured output alongside its tools, so code can track topics;
- after one clarifying question, an unclear rating becomes "Prefer not to say";
- interview writes for every anonymity level go through the token-authorized server path.

**Where the plan was wrong or missing something** (also under "Proposed plan changes" in `docs/DECISIONS.md`):
- On Vercel a request body is limited to 4.5 MB, so a 25 MB `add_document` upload can't pass through a function. Fixed after the build: documents go straight to Storage from the browser.
- `PLAN-EXPLORER.md` was referenced but not supplied.
- The tenancy criterion rules out a readable branding table, so public branding comes from a function.
- The Analyst's session summary is a second task in its `AGENT.md`, which the plan doesn't mention.

**Known risks.**
- An instructor reading interviews directly through Supabase's REST API (bypassing the app) still can't see names or times on anonymous rows, or anything below the group-size threshold. But the raw API returns rows in storage order, which loosely follows when they were last written. The app sorts anonymous transcripts by content and then shuffles them, so its own output carries no ordering; a determined instructor using the raw API might infer some.
- The stub model is rule-based and never misuses a tool. The real model did, in ways only real runs found: reflexive tool calls, dummy arguments, and ending interviews nobody asked to end. The Interviewer's engine now double-checks every consequential tool call. The Brand designer (1.0.0) hasn't met the real model yet, and the Librarian has only been seen answering from documentation.
- The Vocal Bridge integration is built from the published `@vocalbridgeai/sdk` 0.1.1 API. The real service mints tokens for the app's agent, but no one has spoken to it yet.
