# Status

**All eight phases are built.** 77 of the plan's 85 criteria are verified and ticked. The eight that aren't are the Live criteria: there's no model key or Vocal Bridge account, and the real Session 1 rebuild guide and Streamspace logo aren't in the repository. See [Not yet verified](#not-yet-verified).

Last checked on 14 November 2026: `npm run check` passes (type check, lint, 94 Vitest tests in 13 files) and `npm run e2e` passes (22 Playwright tests) while `npm run dev` is running.

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

The four product agents are in `agents/`, each with `AGENT.md` (version 1.0.0), `tools.ts`, `schema.ts`, `evals/`, the agent's code and its stub. Rules that must always hold are in code: the Interviewer's stages, turn and time limits and topic tracking (`agents/interviewer/engine.ts`), anonymity (the schema, column grants and `lib/server/ops/interviews.ts`), quote and theme checks (`agents/analyst/validate.ts`), citation checks (`agents/librarian/answer.ts`), the summary number check (`agents/analyst/summary.ts`) and contrast (`lib/theme/adjust.ts`).

## How to run it

Needs Node 20.9 or later, Docker running, and the Supabase CLI (built with 2.75).

```bash
npm install
supabase start -x studio,imgproxy,vector,logflare,supavisor,edge-runtime   # Postgres, Auth, Storage, Realtime and the mail inbox; -x skips services the app doesn't use
supabase status -o env         # copy the URL and keys into .env.local (see .env.example)
npm run db:reset               # rebuild and seed: "Seeded 2 organizations, 2 courses, 4 sessions and 16 users"
npm run seed:demo              # seven submitted interviews on Session 1 (3 named, 3 anonymous, 1 private)
npm run dev                    # http://localhost:3000
npm run jobs                   # optional: run the scheduled work once (reminders, alerts, retention…)
```

Sign in at `http://localhost:3000/streamspace/sign-in` with a seeded address and open the link from the local inbox at `http://localhost:54324`. Everyone is fictional; addresses use the reserved `.example` domain.

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

**Without `AI_GATEWAY_API_KEY`, every agent runs on its built-in stub**: simple, rule-based behaviour that follows each `AGENT.md` closely enough to exercise the real code around it. Add a gateway key and set the model ids (`AI_MODEL`, optionally per agent) to use real models. The default id `anthropic/claude-sonnet-5.5` should be checked against the gateway's model list.

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

**Latest eval results: no real-model run yet**, because there was no model key. The stub dry run scored 92.9% on the rubric and 86.5% theme agreement; that only shows the harness works and says nothing about the real agents. Stub reports are ignored by git and by the gate.

## Deploying

Not done in this build (it needs Todd's accounts). The steps:

1. Create the Supabase project and run `supabase link` then `supabase db push`. The migrations create the tables, policies, functions and both storage buckets.
2. In Supabase Auth: set the site URL and redirect URLs to the Vercel address; paste `supabase/templates/magic_link.html` into the Magic Link email template; turn off sign-ups by email for unknown addresses if wanted (the app never creates accounts at sign-in); set SMTP to Resend (open decision 8), since Supabase's built-in email is rate-limited.
3. In Vercel, set the environment variables in `.env.example`: Supabase URL and keys, `NEXT_PUBLIC_APP_URL`, `AI_GATEWAY_API_KEY` (or rely on Vercel's OIDC token for the AI Gateway), the model ids, `VOCAL_BRIDGE_API_KEY` and `VOCAL_BRIDGE_AGENT_ID`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`, and optionally `REVIEW_REF_SECRET`.
4. `vercel.json` asks for the cron tick every 15 minutes, which needs a Pro plan. On Hobby, change it to daily.
5. Seed the real organization through `/platform` rather than `npm run db:reset`, which seeds fictional data.

## Not yet verified

| Criterion | Why not | What it needs |
| --- | --- | --- |
| Phase 2, Live: the drafted brief from the Session 1 rebuild guide names Get Document Data, Core Agent and Link Generator | No model key; the real rebuild guide isn't in the repository | A gateway key, then upload the guide to Session 1 as an instructor and read the draft on the admin session page |
| Phase 3, Live: a full interview on Session 1 in under eight minutes, mentioning a brief topic, with themes | No model key | A gateway key; run an interview as a seeded learner |
| Phase 3, Live: `npm run evals` meets both pass marks | No model key | A gateway key; `npm run evals`, then commit the report |
| Phase 5, Live first: the voice trial | No Vocal Bridge account or key | See `docs/VOICE.md` for the trial and the agent settings |
| Phase 5, Live: a full voice interview in Chrome on a laptop and in a phone browser | No Vocal Bridge account or key | As above, on both devices (the phone needs the app reachable over HTTPS) |
| Phase 6, Live: "How do I find my project ID?" answered from the rebuild guide | No model key; no real rebuild guide | A gateway key and the guide on Session 1 |
| Phase 6, Live: an answer citing `docs.streamspace.ai` | No model key | A gateway key; add the site as Dana under Admin → Product documentation, then ask on Session 1 |
| Phase 7, Live: the Streamspace logo gives a blue primary that passes every contrast pair | No model key; the seeded logo is a placeholder | A gateway key and the real logo, uploaded on `/streamspace/settings/brand` |

Verified with a stand-in rather than the real service: Phase 5's browser criterion (microphone permission, spoken turns as microphone-marked bubbles, switching back to typing) ran in Chromium with a fake microphone and a stand-in for the Vocal Bridge client. The real service is covered by the two Live voice criteria above.

## Git

- `main` holds the first commit (`PLAN.md`, `CLAUDE.md`). `build` holds the phase commits. A local `prototype` branch keeps the earlier "Session Feedback" app that was in the folder.
- `main` and `build` are pushed to `github.com/innovaassolutions/feedback`; `main` is the default branch. The `prototype` branch stays local.
- The first CI run on `build` (run 43597848050) showed the eval gate working: the "Eval report for every changed `AGENT.md`" job failed, naming all four agents at 1.0.0 with no passing real-model report. It stays red until `npm run evals` runs with a model key and the report is committed.
- That run's check job also failed, for a different reason: CI installed the latest Supabase CLI (3.1), which no longer accepts the `[inbucket]` section of `supabase/config.toml`. CI now pins the CLI to 2.75.0, the version this repository was built and tested with.
- The code for all eight phases was written before the local database finished downloading (about 90 minutes on this connection), then verified together. The phase commits group the files by phase, so only the last commit, which is the verified tree, is guaranteed to pass `npm run check` and `npm run e2e` on its own.

## Closing notes

**What was built.** Everything in the plan's eight phases: the multi-tenant app on Next.js and Supabase with Row Level Security on every table, four agents behind the Vercel AI SDK with versioned instructions, schemas, stubs and evals, the dashboard, Q&A, voice, branding, quality monitoring, reminders, the follow-up interview and retention.

**Still unverified.** The eight Live criteria in the table above. Each needs a model key, a Vocal Bridge account or the client's real files.

**Decisions.** About 70 choices the plan didn't make are in `docs/DECISIONS.md`. The ones Todd is most likely to want to revisit:
- one instructor per seeded organization doubles as its admin;
- aggregates come from security-definer SQL functions, so the group-size rule holds even against direct API reads;
- every timestamp on anonymous and private interviews is cut to the date;
- the Interviewer returns structured output alongside its tools, so code can track topics;
- after one clarifying question, an unclear rating becomes "Prefer not to say";
- interview writes for every anonymity level go through the token-authorized server path.

**Where the plan was wrong or missing something** (also under "Proposed plan changes" in `docs/DECISIONS.md`):
- On Vercel a request body is limited to 4.5 MB, so a 25 MB `add_document` upload can't pass through a function. Large uploads need a signed direct upload to Storage.
- `PLAN-EXPLORER.md` was referenced but not supplied.
- The tenancy criterion rules out a readable branding table, so public branding comes from a function.
- The Analyst's session summary is a second task in its `AGENT.md`, which the plan doesn't mention.

**Known risks.**
- An instructor reading interviews directly through Supabase's REST API (bypassing the app) still can't see names or times on anonymous rows, or anything below the group-size threshold. But the raw API returns rows in storage order, which loosely follows when they were last written. The app sorts anonymous transcripts by content and then shuffles them, so its own output carries no ordering; a determined instructor using the raw API might infer some.
- The stub model is rule-based. Nothing about the real agents' quality is known until the evals run.
- The Vocal Bridge integration is built from the published `@vocalbridgeai/sdk` 0.1.1 API and hasn't met the real service.
