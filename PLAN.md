# Plan: Course Feedback Platform (working title)

A web platform that tells a training provider, session by session, how a course is landing and what to change before the next session. Learners give feedback by talking to an AI interviewer, by typing or by voice, instead of filling in a form. Instructors get a results dashboard per session, a Q&A board per session, and a place to manage each session's materials. The first course is the Streamspace platform training for the IME Engineering group, which began on 13 November 2026. The platform is multi-tenant from the start: each client organization has its own courses, data and branding.

The outcome we are designing toward: within 24 hours of a session, the instructor can see who responded, how able learners are to apply what was taught, what blocked them and which questions are still open, and can tell learners what will change as a result.

**Stack.** Next.js (App Router), React and TypeScript, styled with Tailwind and hosted on Vercel. Supabase provides Postgres, Auth, Storage, Realtime and pgvector. Vocal Bridge provides voice. Agents run in TypeScript through the Vercel AI SDK. There is no Python anywhere in the build.

**Features.**

1. **Feedback dashboard.** Results for each session and the trend across sessions, shown as tiles, charts, themes and learner quotes.
2. **Session Q&A.** Learners ask questions against a session, with their name or anonymously. Answers come straight away from the session's documents, the product documentation and earlier verified answers, and then from the instructor.
3. **AI interviewer.** A short conversation in a normal chat window. The learner chooses how anonymous to be, and can type or speak, switching at any point.
4. **Instructor administration.** Sessions, supporting documents per session, the roster and the interview guide.
5. **Course branding.** Upload a logo and an agent proposes the theme for that organization. A person approves it.
6. **Added beyond the brief** (strike any you don't want): telling learners what changed because of their feedback, a follow-up interview a month after the course, a read-only view for the client's sponsor, and a quality page for the agents.

**Agents.** Four agents, each with one narrow job. The Interviewer runs the feedback conversation. The Analyst turns a finished interview into ratings, themes and quotes. The Librarian reads session documents and the product documentation, writes the session brief and answers Q&A questions from those sources. The Brand designer proposes a theme from a logo.

**Keeping their output consistent.** Code enforces the rules and the model supplies the wording. Every agent output is validated against a schema. Each agent's instructions are a versioned `AGENT.md` file, and a change to one must pass a fixed set of evals before it ships. In production every agent call is logged with its `AGENT.md` version, cost and outcome, and every interview is scored against a rubric. The design section sets this out in full.

## Project setup

- **Repository.** `https://github.com/innovaassolutions/feedback.git`. It was empty on 14 November 2026.
- **First commit.** It goes straight to `main`, because an empty repository has no branch to open a pull request against. It holds `PLAN.md`, `PLAN-EXPLORER.md` and `CLAUDE.md` only.
- **Building.** All eight phases are built in order on one branch, `build`, with a commit at the end of each phase. `CLAUDE.md` holds the working rules for the coding agent. Review and adjustments come after the build, before `build` is merged into `main`.
- **Hosting.** A Vercel project has been created for this app. Still to record here: the project's name, and whether it is connected to the repository.
- **First deploy.** Once the project is connected, Vercel deploys every push. Until phase 1 adds the Next.js app, a deploy either fails or, with the framework set to "Other", publishes the repository's files at the project's address, this plan included. Pause deployments until phase 1 if the plan should stay private.

## Design

### Feedback practice this plan follows

- **Kirkpatrick's four levels** (reaction, learning, behavior, results) set what we measure. Each session interview covers level 1, and level 2 as the learner reports it. The follow-up interview covers level 3. Level 4 is out of scope.
- **Performance-focused questions** (Will Thalheimer) replace agree/disagree scales. Rating items offer concrete answers such as "Yes, with the guide beside me", which an instructor can act on.
- **Ask straight away and again later.** The session interview captures what is fresh. The follow-up asks what was used at work.
- **Protect small groups.** Aggregated results and anonymous answers stay hidden until a minimum number of learners have responded.
- **Close the loop.** Instructors record what they changed, and learners see it before the next session.
- **Keep it short and collect it in the room.** The interview targets five to eight minutes. A QR code on the last slide gets a far higher response rate than a link sent later.

### Roles

| Role | Scope | Can do |
| --- | --- | --- |
| `platform_admin` | Everything | Create organizations, see agent quality |
| `org_admin` | One organization | Manage branding, courses and instructors |
| `instructor` | One course | Manage sessions, documents, roster and guide. See results and transcripts. Answer questions |
| `sponsor` | One course | See aggregated results and actions. Never sees transcripts or quotes |
| `learner` | One course | See sessions and materials, give feedback, ask and vote on questions |

### Session states

| State | Meaning | Label on screen |
| --- | --- | --- |
| `draft` | Being set up, hidden from learners | Draft |
| `scheduled` | Visible to learners, not yet delivered | Upcoming |
| `open` | Delivered. Feedback and Q&A are open | Feedback open |
| `closed` | Feedback window has ended. Q&A stays open | Closed |

A session moves `draft` → `scheduled` → `open` → `closed`, and no other way.

### Interview states

| State | Meaning | Label on screen |
| --- | --- | --- |
| `in_progress` | The learner is talking to the Interviewer | In progress |
| `submitted` | The learner confirmed the summary and submitted | Submitted |
| `analysed` | The Analyst has produced insights | Analysed |
| `needs_review` | The Analyst's output failed validation twice | Needs review |
| `abandoned` | No activity for 24 hours. Saved ratings are kept and the conversation is not analysed | Abandoned |

### Question states

| State | Meaning | Label on screen |
| --- | --- | --- |
| `open` | Posted, no answer yet | Waiting for an answer |
| `ai_answered` | Answered from the course's sources, not yet reviewed | AI answer · not reviewed |
| `needs_instructor` | The sources don't cover it. The instructor has been notified | Sent to instructor |
| `answered` | The instructor wrote or verified the answer | Answered by instructor |

### Anonymity levels

The learner chooses a level at the start of the interview and can change it on the summary screen before submitting. The default is `anonymous`.

| Level | Label | What instructors see | What is stored |
| --- | --- | --- | --- |
| `named` | Named | Name, ratings and transcript | The interview is linked to the learner |
| `anonymous` | Anonymous | Ratings and transcript, with no name or time | No link to the learner |
| `private` | Private, summary only | Nothing individual. The answers count toward scores and themes | No link to the learner. The transcript is deleted once the Analyst has finished, and no quotes are kept |

How anonymity is kept:

- An anonymous or private interview has no `participant_id`. Completion is recorded in a separate `completions` table, with a date and no time, so the two can't be matched. No column or key links them.
- Instructors see anonymous transcripts in random order, and only once the session has at least `min_group_size` submitted interviews.
- Voice is transcribed and the audio is never stored. The name sent to Vocal Bridge is "Learner" for anonymous and private interviews.
- Logs never contain transcript text. Agent run records carry no learner id for anonymous and private interviews.
- The consent screen says plainly that in a small group, writing style can still identify someone, and that Private is the safest choice.

### Database

- Supabase Postgres with migrations in `supabase/migrations`. Row Level Security is on for every table. A test fails if any table in `public` has it off.
- Every row carries `organization_id`. Policies scope reads and writes by organization, course and role.
- Tables: organizations, themes, memberships, courses, enrollments, sessions, documents, documentation_sources, document_chunks, guides, interviews, interview_turns, ratings, insights, completions, questions, answers, question_votes, actions, agent_runs, quality_checks and jobs.
- `document_chunks` holds text, a pgvector embedding and a source kind: `session_document`, `documentation_page` or `verified_answer`. Files live in Supabase Storage: a private `documents` bucket served through signed URLs, and a public `logos` bucket.
- Sign-in is by magic link through Supabase Auth. There are no passwords and no shared accounts.
- Server code acts as the signed-in user, so Row Level Security applies. The secret key is used only in `lib/server/` for seeding, background jobs and writes to anonymous interviews, which are authorized by an interview token held in an httpOnly cookie.
- Limits are settings on the course, not written into the code: `min_group_size` (5), `max_turns` (14), `max_minutes` (15), `follow_up_days` (30) and `retention_days` (365).
- `npm run db:reset` rebuilds the local database and seeds one platform admin and two organizations. Streamspace has the IME Engineering course with three sessions (Session 1 `open`, Session 2 `scheduled`, Session 3 `draft`), eight demo learners, two instructors and one sponsor. Northwind Academy is a fictional second tenant with one course, one session, three learners and one instructor. Seed users are fictional.
- `npm run seed:demo` adds seven submitted interviews for Session 1: three named, three anonymous and one private.

### API

Route Handlers under `app/api`. Every operation has a name, a one-line description and a Zod schema for its input, with no optional inputs. The agents' tools are named after the operations they call.

| Operation | Route | What it does |
| --- | --- | --- |
| `list_sessions` | `GET /api/courses/{course_id}/sessions` | The sessions a user may see, with state and response counts |
| `get_session` | `GET /api/sessions/{session_id}` | The session, its brief, and the documents the user may see |
| `create_session` | `POST /api/courses/{course_id}/sessions` | Body `{title, date, objectives}`. Creates a draft session |
| `set_session_state` | `POST /api/sessions/{session_id}/state` | Body `{state}`. Moves a session to its next state |
| `add_document` | `POST /api/sessions/{session_id}/documents` | Body `{title, audience, file}`. Stores the file and queues it for reading |
| `remove_document` | `DELETE /api/documents/{document_id}` | Removes a document and its chunks |
| `approve_brief` | `POST /api/sessions/{session_id}/brief` | Body `{objectives, topics, known_issues}`. Saves the brief the Interviewer will use |
| `add_documentation_source` | `POST /api/organizations/{organization_id}/documentation` | Body `{url}`. Reads a product documentation site into the organization's sources |
| `invite_learners` | `POST /api/courses/{course_id}/enrollments` | Body `{emails}`. Enrolls learners and sends magic links |
| `start_interview` | `POST /api/sessions/{session_id}/interviews` | Body `{anonymity, kind}`. Starts an interview and sets its token |
| `send_turn` | `POST /api/interviews/{interview_id}/turns` | Body `{text, mode}`. Adds the learner's turn and returns the Interviewer's reply |
| `save_rating` | `POST /api/interviews/{interview_id}/ratings` | Body `{item_id, choice}`. Saves one rating |
| `submit_interview` | `POST /api/interviews/{interview_id}/submit` | Body `{anonymity, summary}`. Submits the interview and queues analysis |
| `get_voice_token` | `POST /api/interviews/{interview_id}/voice-token` | Mints a short-lived Vocal Bridge token |
| `get_session_results` | `GET /api/sessions/{session_id}/results` | The aggregated metrics, themes and quotes for a session |
| `list_interviews` | `GET /api/sessions/{session_id}/interviews` | The transcripts an instructor may read |
| `record_action` | `POST /api/sessions/{session_id}/actions` | Body `{you_said, we_did, status}`. Records a change made because of feedback |
| `list_questions` | `GET /api/sessions/{session_id}/questions` | The questions, by votes and then time |
| `ask_question` | `POST /api/sessions/{session_id}/questions` | Body `{text, anonymous}`. Posts a question and queues an answer |
| `vote_question` | `POST /api/questions/{question_id}/votes` | Adds the learner's "I have this question too" |
| `answer_question` | `POST /api/questions/{question_id}/answers` | Body `{text, verifies_answer_id}`. An instructor answers, or verifies an AI answer |
| `propose_theme` | `POST /api/organizations/{organization_id}/themes` | Body `{logo}`. The Brand designer proposes a theme |
| `approve_theme` | `POST /api/themes/{theme_id}/approval` | Body `{tokens}`. Makes a theme live for the organization |
| `get_quality` | `GET /api/platform/quality` | Agent quality figures by agent and `AGENT.md` version |

Rules the backend enforces:

- An id from another organization returns 404, the same as an unknown id.
- `set_session_state` allows only the next state in the order above (409 otherwise).
- `add_document` accepts PDF, DOCX, Markdown, plain text and VTT up to 25 MB (422 otherwise). A document with audience `agents_only` is never returned to a learner or sponsor.
- `add_documentation_source` needs an organization admin (403). It reads only pages under the address given, follows the site's rules for robots, and stops at 500 pages.
- `start_interview` needs an enrolled learner (403), an `open` session (409), and no completion for that session and kind (409).
- `send_turn` needs a valid interview token (401) and an interview in progress (409). At `max_turns` or `max_minutes`, whichever comes first, the Interviewer moves to the summary. Past the hard limit of `max_turns + 4` it returns 409.
- `submit_interview` needs every rating item answered or skipped (422). It writes the completion row separately from the interview.
- `get_session_results` returns only the response count while a session has fewer than `min_group_size` submitted interviews.
- `list_interviews` never returns private interviews. It returns anonymous ones without ids or times, in random order, and only at or above `min_group_size`. Sponsors get 404.
- `ask_question` with `anonymous: true` stores no author id. `vote_question` allows one vote per learner per question (409).
- `answer_question` needs an instructor (403).
- `approve_theme` refuses a theme where any text and background pair has a contrast ratio under 4.5:1 (422).

### Agents

**The Interviewer**

- A staged conversation: `consent` → `ratings` → `conversation` → `read_back`. Code decides the stage and tracks which topics are covered. The model writes the questions and the follow-ups.
- Tools: `save_rating`, `raise_question`, `flag_blocker` and `end_interview`. It has no tool to read other learners' feedback, the roster or the dashboard, and for anonymous and private interviews it is never given the learner's name.
- Its context is the course guide, the approved session brief, and the actions recorded since the last session. It never sees raw documents.
- Ratings stage: four default items with concrete choices, each with "Prefer not to say". In chat they appear as tappable chips, and a tap saves the rating without calling the model. In voice the Interviewer reads the choices out and calls `save_rating` with the match, asking once if the answer is unclear.
  - `ability`: "Could you now do what this session taught, on your own?" Yes, without help · Yes, with the guide beside me · Only with someone helping · Not yet
  - `pace`: Too slow · About right · Too fast
  - `relevance`: "How much of this session will you use in your work?" Most of it · Some of it · A little · None yet
  - `recommend`: 0 to 10
- Conversation stage: what was most useful, what was unclear, what blocked or slowed the learner, what to change next time, one question drawn from the session brief, and whether the last session's changes helped. One question per turn, one follow-up per topic, and no leading questions.
- If the learner asks a question about the course content, the Interviewer offers to post it to the session's Q&A and calls `raise_question` only with their agreement. A blocker such as "I still can't log in" is sent to the instructor at once through `flag_blocker`.
- Read-back stage: the Interviewer summarises what it heard in three to five points. The learner confirms, edits or removes points, then submits. This is the learner's check on accuracy and our main quality signal.

**The Analyst**

- One structured call per submitted interview, with no tools. Input: the transcript and the confirmed summary. Output: sentiment per theme, blockers, suggestions, quotes and one-line paraphrases.
- Themes come from a fixed list: Content and relevance, Pace and timing, Instructor delivery, Hands-on practice, Materials and documentation, Platform and access, Logistics, and Support and follow-up.
- Ratings come from the saved `ratings` rows. The Analyst never produces or changes them.
- Code checks the output. A quote must appear word for word in the learner's turns or it is dropped. A theme outside the list fails validation. A failed output is retried once, then the interview is marked `needs_review`.
- For private interviews it produces paraphrases only, and the turns are deleted when it finishes.
- It also writes the session summary shown on the dashboard. Code computes every number and passes it in. If the summary contains a number that was not passed in, a template summary is shown instead.

**The Librarian**

- Reads each uploaded document: extracts the text, splits it into chunks and stores embeddings.
- Reads the organization's product documentation site the same way, page by page. It re-reads the site weekly, so changed pages are updated and removed pages are dropped. Documentation belongs to the organization, so every course it runs can use it.
- Drafts the session brief (objectives, topics covered, known issues) from the session's documents. The instructor edits and approves it before the Interviewer can use it.
- Answers Q&A questions with one tool, `search_sources`, which searches three kinds of source for that course only: session documents, documentation pages and verified answers. Every answer must cite the chunks it used, and each citation shows its kind. Code checks that each cited chunk exists and belongs to the course.
- When an instructor writes or verifies an answer, it becomes a source for later questions. Editing or deleting the answer updates or removes it.
- When two sources disagree, the answer says so and the question also goes to the instructor.
- If nothing relevant enough is found, it doesn't answer and the question moves to `needs_instructor`. These questions are the record of what the sources don't cover.

**The Brand designer**

- Input: the logo. Output: theme tokens for light and dark mode (primary, accent, background, surface, text, muted, five chart colors, corner radius, and a heading and body font from an approved list).
- Code checks every text and background pair for a 4.5:1 contrast ratio and adjusts or rejects the proposal. Nothing goes live until an organization admin approves it in the preview.

### Keeping agent quality consistent

- **Instructions are files.** Each agent has a folder under `agents/` that holds its `AGENT.md` (its instructions, with a version), its tools, its output schema and its eval cases. Every agent call records the `AGENT.md` version and the model in `agent_runs`, with tokens, cost, latency and outcome.
- **Two kinds of instruction file.** An `AGENT.md` instructs an agent inside the product. The root `CLAUDE.md` instructs the coding agent that builds the product.
- **Rules live in code.** Stage order, turn limits, anonymity, citation checks, quote checks and contrast checks don't depend on the model following instructions.
- **Evals before a prompt ships.** `npm run evals` runs two sets against the real model and writes a report to `evals/reports/`:
  - Eight scripted learner personas each hold an interview: satisfied, terse, confused beginner, critical, off-topic, non-native English, one who asks a content question, and one who tries to change the Interviewer's instructions.
  - Twelve hand-labelled transcripts check the Analyst's themes against a person's labels.
- **The interview rubric**, scored pass or fail per item: one question per turn, no leading questions, every guide topic covered or skipped by the learner, a read-back that matches the transcript, limits respected, "I'd rather not say" accepted without pushing, and instructions inside learner messages ignored. Limits and coverage are checked in code. The rest are scored by a judge model.
- **Pass marks**: 90% of rubric items across the personas, and 85% agreement on themes. A change to any `AGENT.md` can't merge without a report for the new version that meets both.
- **In production**, each submitted named or anonymous interview is scored against the same rubric by a background job. A private interview gets only the items checked in code, because its transcript is deleted. The quality page shows, by agent and `AGENT.md` version: runs, validation failure rate, rubric pass rate, share of read-backs confirmed without edits, abandon rate, median turns, cost per interview, share of AI answers verified without edits, and share of questions the sources couldn't answer.
- **People stay in the loop.** Learners confirm the read-back and rate the interview with one tap. Instructors mark an interview's insights Accurate or Not accurate, and the inaccurate ones become candidates for the labelled set.
- **Alerts.** The platform admin is emailed when the seven-day rubric pass rate falls under 85% or validation failures pass 5%.

### Voice

- The chat window has a microphone button. Voice and typing share one conversation, one transcript and one Interviewer.
- The browser uses `@vocalbridgeai/react`. The server mints a short-lived token from `https://vocalbridgeai.com/api/v1/token` with the API key, which never reaches the browser.
- Vocal Bridge runs in its AI Agent mode: it transcribes the learner's speech and passes it to `send_turn` through `useAIAgent`, then speaks the reply. Live transcript events fill the chat bubbles as the learner speaks.
- Whether every utterance can be relayed and every reply spoken word for word is the first thing phase 5 confirms.

### Pages

- Learner: the course home (`/[org]/[course]`), a session page with materials, Q&A and "Give feedback" (`/sessions/[n]`), and the interview (`/sessions/[n]/interview`).
- Instructor and sponsor: the dashboard (`/dashboard`) and a session's results (`/dashboard/sessions/[n]`).
- Instructor: administration (`/admin`) for sessions, documents, roster and guide.
- Organization admin: branding (`/[org]/settings/brand`). Platform admin: organizations and quality (`/platform`).
- Dashboard tiles: Responses (7 of 8), Able to apply (learners who chose either "Yes" answer), Pace about right, and Recommend (average, with the spread). Net Promoter Score appears only at ten or more responses. Tiles show counts as well as percentages, because cohorts are small.
- Dashboard charts, built with Recharts: the ability spread per session, the pace spread, positive and negative mentions per theme, the trend across sessions, and questions open against answered. Every chart has a table view.
- Below the charts: the session summary, top blockers, suggestions, quotes, the "You said, we did" list, and a print view of the session report.
- There are no cuts by job title, team or any other attribute, which protects anonymity.

### Branding

- An approved theme is a row of tokens. The organization's layout writes them as CSS variables, and Tailwind's theme reads those variables, so no component holds a brand color.
- Charts take their colors from the theme's five chart colors. The logo shows in the header, on the sign-in page and on the printed report.
- Light and dark mode follow the system setting. Theme history is kept and an earlier theme can be restored.
- Phase 1 seeds a hand-written Streamspace theme, so the first course is branded before the Brand designer exists.

### Tests

- Vitest covers metric functions, route handlers, Row Level Security policies and every agent against a stub model. Row Level Security tests sign in as seeded users from both organizations.
- Playwright runs end to end against its own Next.js server on port 3100 and its own local Supabase database, so `npm run e2e` works while `npm run dev` is running. Each test works on its own session or interview, so tests can run in any order.
- `npm run check` runs the type check, lint and Vitest.

### How the criteria are checked

API calls and pages run against `npm run dev` with a local Supabase (`supabase start`) on a freshly seeded database (`npm run db:reset`). Pages are checked in the browser at `http://localhost:3000`. Sign-in emails are read from the local Supabase mail inbox. Tests never call a model or Vocal Bridge. Only the criteria marked "Live" use the real model and the real voice service.

## Phase 1: Tenancy, sign-in and the course pages

Set up the Next.js app, the schema with Row Level Security, magic-link sign-in, roles, the seed data and the read-only course and session pages. Apply the seeded Streamspace theme. Set up the test servers.

- [ ] `npm run db:reset` prints `Seeded 2 organizations, 2 courses, 4 sessions and 16 users`
- [ ] Signing in by magic link as a seeded Streamspace learner lands on `/streamspace/ime-engineering`, which lists Session 1 as Feedback open and Session 2 as Upcoming. The draft session isn't listed
- [ ] The same page as a seeded instructor lists all three sessions and shows an Admin link. A learner sees no Admin link, and `/streamspace/ime-engineering/admin` shows "Page not found"
- [ ] Vitest: a Northwind learner reading Streamspace rows gets zero rows from every table, and the reverse holds
- [ ] Vitest: a query of the Postgres catalog finds no table in `public` with Row Level Security off
- [ ] An unknown course, and a real course the user isn't enrolled in, both show "Course not found"
- [ ] Browser: the header on a Streamspace page and on a Northwind page have different computed background colors, each matching its seeded theme
- [ ] `grep -rn SUPABASE_SECRET_KEY app components` finds nothing
- [ ] `npm run e2e` passes while `npm run dev` is running
- [ ] `npm run check` passes

## Phase 2: Instructor administration

Add `create_session`, `set_session_state`, `add_document`, `remove_document`, `approve_brief` and `invite_learners`, the administration pages, document reading by the Librarian, and the join link and QR code.

- [ ] An instructor creates Session 4 with a title, date and objectives, and moves it Draft → Upcoming → Feedback open → Closed. Moving a closed session back returns 409
- [ ] Uploading a PDF, a DOCX, a Markdown file and a VTT transcript each succeed. An `.exe` and a 26 MB file each return 422 and store nothing
- [ ] A learner's session page lists the documents with audience `learners` and downloads them through a signed URL. An `agents_only` document isn't listed, and its URL returns 404 for a learner
- [ ] Stub model test: reading a document stores its chunks with embeddings and moves it `processing` → `ready`. A corrupt file ends as `failed`, with a message on the administration page
- [ ] Stub model test: the drafted brief has objectives, topics and known issues, and `get_session` returns no brief to the Interviewer until an instructor approves it
- [ ] Pasting three email addresses creates three enrollments and three sign-in emails in the local inbox. A duplicate address is skipped and reported
- [ ] The session page shows a join link and a QR code. Opening it signed out leads to sign-in and then to that session's interview
- [ ] Live: after uploading the Session 1 rebuild guide, the drafted brief names topics such as Get Document Data, Core Agent and Link Generator
- [ ] `npm run check` passes

## Phase 3: The Interviewer and the Analyst, in chat

Write `agents/interviewer/AGENT.md`, `agents/analyst/AGENT.md` and the default guide. Add `start_interview`, `send_turn`, `save_rating` and `submit_interview`, the chat page, the analysis job and the eval sets.

- [ ] A test checks that the Interviewer's tools are exactly `save_rating`, `raise_question`, `flag_blocker` and `end_interview`
- [ ] Stub model test, named: consent, four ratings, the conversation, the read-back and submission. The interview ends `analysed`, is linked to the learner, and has its turns recorded in order
- [ ] Stub model test, anonymous: the interview has no `participant_id`, and a `completions` row exists with a date and no time. A schema test confirms no column or key links the two tables
- [ ] Stub model test, private: after analysis no turns remain, and the insights hold paraphrases and no quotes
- [ ] `start_interview` returns 403 for a user who isn't enrolled, 409 for a session that isn't open, and 409 after the learner has submitted for that session
- [ ] `send_turn` without a valid token returns 401. At turn 14 the Interviewer moves to the read-back, and a turn past the hard limit returns 409
- [ ] Choosing "Prefer not to say" on every rating still allows submission. Leaving one rating unanswered returns 422
- [ ] Analyst stub tests: a quote that isn't in the learner's turns is dropped, and a theme outside the list is retried once and then marks the interview `needs_review`
- [ ] Stub model test: when the learner agrees, `raise_question` stores an open question on the session. Without agreement nothing is stored
- [ ] Browser: rating choices show as chips, a progress marker shows the stage, and the summary screen lets the learner edit points and change the anonymity level before submitting
- [ ] Live: a full interview on Session 1 finishes in under eight minutes, the read-back mentions a topic from the session brief, and the insights name at least one theme
- [ ] Live: `npm run evals` scores at least 90% on the rubric across the eight personas and 85% agreement on the twelve labelled transcripts, and saves its report
- [ ] `npm run check` passes

## Phase 4: The feedback dashboard

Add `get_session_results`, `list_interviews` and `record_action`, the dashboard pages with tiles and charts, the session summary, the small-group rule and the print view.

- [ ] Vitest covers each metric: response rate, Able to apply, the pace spread, the Recommend average, and the Net Promoter Score appearing only at ten or more responses
- [ ] After `npm run seed:demo`, Session 1 shows Responses 7 of 8, Able to apply 5 of 7, Pace about right 4 of 7 and Recommend 7.7, with no Net Promoter Score
- [ ] Browser: the ability, pace, theme and trend charts render, each with a table view holding the same numbers
- [ ] With four submitted interviews, `get_session_results` returns only the count, and the page shows "Results appear once 5 learners have responded"
- [ ] An instructor's transcript list shows three named interviews with names and three anonymous ones with no name or time. A test with a fixed shuffle seed confirms the anonymous ones don't come back in submission order. The private interview never appears
- [ ] A sponsor sees the tiles, charts, themes and actions. The transcript list and quotes return 404
- [ ] Stub model test: a session summary containing a number that wasn't passed in is replaced by the template summary
- [ ] An instructor records a "You said, we did" item on Session 1. It appears on the learner's Session 2 page and in the Interviewer's context for Session 2
- [ ] Browser: the print view of the session report has no navigation and fits A4 pages
- [ ] Browser: charts use the organization's chart colors in light and dark mode, and the console shows no errors
- [ ] `npm run check` passes

## Phase 5: Voice

Add `get_voice_token` and the microphone to the chat window, using Vocal Bridge.

- [ ] Live, first: a short trial confirms that every spoken turn reaches `send_turn` and every reply is spoken word for word. `docs/VOICE.md` records the result, the Vocal Bridge agent settings used, and whether audio recording can be turned off
- [ ] `get_voice_token` without a valid interview token returns 401. `grep -rn VOCAL_BRIDGE_API_KEY app components` finds nothing
- [ ] A test checks that the participant name sent to Vocal Bridge is "Learner" for anonymous and private interviews
- [ ] Browser: pressing the microphone asks for permission, spoken turns appear as chat bubbles marked with a microphone, and switching back to typing continues the same interview
- [ ] Stub test: saying "about right" at the pace item saves that rating. An unclear answer gets one clarifying question
- [ ] With the microphone refused, or the voice service unreachable, the chat still works and shows a notice
- [ ] `interview_turns` holds text only, and no audio file is written to Storage
- [ ] Live: a full voice interview completes in Chrome on a laptop and in a phone browser
- [ ] `npm run check` passes

## Phase 6: Session Q&A

Add `list_questions`, `ask_question`, `vote_question`, `answer_question` and `add_documentation_source`, the Q&A board on the session page, and the Librarian's answers from session documents, product documentation and verified answers.

- [ ] A learner posts one question with their name and one anonymously. The anonymous row has no author id and shows as "Anonymous learner"
- [ ] A learner's vote counts once, and a second vote returns 409. The list is ordered by votes and then time
- [ ] A question or answer posted in one browser appears in another within two seconds, without a reload
- [ ] Librarian stub tests: an answer cites at least one chunk from the course. A citation of a chunk from another course is rejected. With nothing relevant, the question moves to `needs_instructor` and the instructor is notified
- [ ] Stub test against a five-page fixture documentation site: `add_documentation_source` stores chunks for all five pages. A second read updates a changed page and drops a removed one. A link to another host isn't followed
- [ ] An instructor's verified answer becomes a source: a later, similar question is answered citing it. Deleting the answer removes it as a source
- [ ] Stub test: when two sources disagree, the answer says so and the instructor is notified
- [ ] An AI answer shows "AI answer · not reviewed" and links to its sources, each marked Session document, Documentation or Verified answer. A source with audience `agents_only` is named without a link
- [ ] An instructor verifies an AI answer, and the label changes to "Answered by instructor". An instructor can also edit it, replace it, or delete the question. A learner calling `answer_question` gets 403
- [ ] The dashboard gains a Q&A tile: open against answered, the median time to an answer, and how many questions went to the instructor
- [ ] Live: asking "How do I find my project ID?" on Session 1 returns an answer that points to the address bar and cites the rebuild guide
- [ ] Live: after adding `docs.streamspace.ai`, asking "How do I publish a new version of a workflow?" returns an answer that cites a documentation page
- [ ] `npm run check` passes

## Phase 7: Branding and a new tenant

Add `propose_theme` and `approve_theme`, the Brand designer, the preview page and organization setup for the platform admin.

- [ ] A PNG or SVG logo up to 2 MB uploads. Anything else returns 422
- [ ] Stub model test: the proposal has every token for light and dark mode and passes the schema
- [ ] Vitest: a proposal with a text and background pair under 4.5:1 is adjusted until it passes. `approve_theme` with a failing pair returns 422
- [ ] Browser: the preview shows the header, a dashboard tile, a chart and the chat in the proposed theme before approval. Changing a color updates the preview
- [ ] After approval the whole organization uses the new theme on the next page load, with the logo in the header, on the sign-in page and on the printed report
- [ ] Theme history lists earlier themes, and restoring one makes it live
- [ ] e2e: a platform admin creates a third organization with a name, address and logo, approves its theme, creates a course and invites a learner, with no code change
- [ ] Live: from the Streamspace logo, the proposed primary color is in the logo's blue family and every pair passes the contrast check
- [ ] `npm run check` passes

## Phase 8: Quality monitoring, reminders and the follow-up interview

Add `get_quality`, the rubric job, alerts, the review queue, email reminders, the follow-up interview and data retention. Write `docs/STATUS.md`.

- [ ] Every agent call writes an `agent_runs` row with the agent, `AGENT.md` version, model, tokens, cost, latency and outcome. Rows for anonymous and private interviews carry no learner id
- [ ] The quality page shows each figure listed in the design, by agent and `AGENT.md` version
- [ ] Stub test: a submitted named or anonymous interview gets a rubric result from the background job. A private interview gets the code-checked items only
- [ ] With seeded results under the pass marks, the platform admin receives an alert email
- [ ] An instructor marks an interview's insights Not accurate, and it appears in the list of candidates for the labelled set
- [ ] CI fails a change to any `AGENT.md` that has no eval report for its new version
- [ ] With a fake clock: a learner with no completion gets one reminder 24 hours after the session opens and one 24 hours before it closes. A learner who has submitted gets none
- [ ] The follow-up interview opens `follow_up_days` after the last session, asks what the learner has used at work and what stopped them, and adds an "Applied at work" tile to the dashboard
- [ ] With a fake clock: transcripts older than `retention_days` are deleted. A learner's request removes their named interviews and questions
- [ ] `docs/STATUS.md` describes what's built, how to seed and run it, how to run the evals, and the latest eval results
- [ ] `npm run check` passes

## Open decisions

Each has the default this plan assumes. Change any of them and the affected phase changes with it.

1. **Name.** "Course Feedback Platform" is a placeholder.
2. **AI answers in Q&A.** Default: shown at once, labelled as not reviewed, and limited to what the course's sources say. The alternative is that the instructor approves every answer before learners see it, which is safer and slower.
3. **Minimum group size.** Default 5. The IME cohort is small, so a session with four responses shows nothing. It can be lowered to 3 per course, at a cost to anonymity.
4. **Default anonymity level.** Default `anonymous`. `named` gives the instructor more to act on, and `anonymous` gets more candid answers.
5. **Who sees results.** Default: instructors and sponsors. Learners see only the "You said, we did" list.
6. **Sponsor role.** Included. Remove it if the client's manager should not have a login.
7. **Model provider.** Default: the Vercel AI Gateway, with the model id in an environment variable so it can be changed without a code change.
8. **Email.** Magic links and reminders need an email provider in production, because Supabase's built-in email is rate-limited and meant for testing. Default: Resend. This is the one addition to the stack.
9. **Languages.** Default: English only. Vocal Bridge's documentation doesn't list the languages it supports, so Bahasa Malaysia and Mandarin depend on what phase 5 finds.
10. **Organization addresses.** Default: a path per organization (`/streamspace/...`). Custom domains can come later.
11. **Vocal Bridge tooling.** Its command-line tool installs with Python's pip. This plan configures the voice agent in the Vocal Bridge dashboard and uses only the npm packages, which keeps Python out of the build.

## Not in this plan

- Exploring the client's application through a browser to build a screen reference for the Librarian. That has its own plan, `PLAN-EXPLORER.md`.
- Kirkpatrick level 4: business results and return on investment.
- Tests of knowledge, grading and certificates.
- Hosting video, scheduling sessions, taking attendance, and links to Zoom, WhatsApp or Slack.
- Interviews by phone call, and native mobile apps.
- Custom domains, single sign-on and billing.
- Comparing instructors, and results cut by job title or team.
- Branding from a website address instead of a logo.
- Starting an interview on a learner's behalf. Learners start their own.
