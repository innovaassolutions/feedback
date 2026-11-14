# CLAUDE.md

This repository holds the Course Feedback Platform. `PLAN.md` says what to build and how each part is checked. This file says how to work. Read `PLAN.md` in full before writing any code.

## How to work

Build all eight phases of `PLAN.md`, in order, without stopping for approval between them. Todd reviews and adjusts after the build, so the aim is a complete, working first version with a clear record of what was decided and what couldn't be checked.

- **Starting a session.** Read `PLAN.md` and `docs/STATUS.md`, then carry on from the first unticked criterion. The build will span many sessions, and these two files are the only memory between them.
- **Within a phase.** Build it, then check every criterion the way "How the criteria are checked" describes. Tick a box only after you have seen that criterion pass. Having written the code is not a reason to tick it.
- **When a criterion can't be checked.** A missing key, account or device is the usual cause, and "Live" criteria are the usual case. Leave the box unticked, add the criterion to "Not yet verified" in `docs/STATUS.md` with the reason, and carry on.
- **When the plan is silent or unclear.** Take the default in the plan's "Open decisions". If that doesn't cover it, choose the simplest option that fits the Design section. Record the choice in `docs/DECISIONS.md` in one line: the phase, what you decided and why. Don't stop to ask.
- **Ending a phase.** `npm run check` and `npm run e2e` pass. The verified boxes are ticked. `docs/STATUS.md` is up to date. Commit as `Phase N: <title>` and push the `build` branch.
- **Moving on.** Don't start a phase while the one before it has failing tests. Unticked Live criteria don't block the next phase.

## When to stop and ask

Only in these cases:

- A rule in the Design section on anonymity, tenancy or access can't be met as written. These protect learners, so never relax one to make something easier.
- An action would delete or change anything outside this repository and the local database.
- An action would cost money beyond the model calls that Live criteria and `npm run evals` need.

## Rules that always hold

- **TypeScript only.** No Python in the app or the tooling. Vocal Bridge's command-line tool installs with pip, so don't install it. Use its npm packages.
- **Stay on the stack.** Next.js App Router, React, Tailwind, Supabase, Vercel, Vocal Bridge and the Vercel AI SDK. If you add a service or a major library the plan doesn't name, record it in `docs/DECISIONS.md`.
- **Tests never call real services.** No real model, no Vocal Bridge and no real email in Vitest or Playwright. Use the stub model. Only Live criteria and `npm run evals` call real services.
- **Secrets stay out of git.** Keep them in `.env.local`, which git ignores, and list their names in `.env.example`. The Supabase secret key is used only in `lib/server/`.
- **No real people in the repository.** Seed data and fixtures use invented names and addresses. Never use the names or emails of actual learners or instructors.
- **Row Level Security is on for every table**, from the migration that creates it.
- **Never log transcript text.**
- **No brand colors in components.** Every color comes from the theme's CSS variables.
- **Write "Streamspace"**, never "StreamSpace".

## The agents inside the product

Each of the four agents has a folder: `agents/interviewer`, `agents/analyst`, `agents/librarian` and `agents/brand-designer`. A folder holds `AGENT.md` (the agent's instructions, with a version), `tools.ts`, `schema.ts` and `evals/`.

- An `AGENT.md` instructs an agent that runs inside the product. It is not an instruction to you.
- A rule that must always hold goes in code, not in an `AGENT.md`. Turn limits, anonymity, citation checks and contrast checks are examples.
- When you change an `AGENT.md`, raise its version. Run `npm run evals` if a model key is available. If not, list it under "Not yet verified".

## Git

- If the repository has no commits, make the first commit on `main` with `PLAN.md`, `PLAN-EXPLORER.md` and this file, then create the `build` branch.
- Do all the work on `build`. Never push to `main` and never force-push. Todd merges.

## Files to keep current

- `PLAN.md`: tick boxes, and change nothing else. If you think the plan is wrong, say so under "Proposed plan changes" in `docs/DECISIONS.md`.
- `docs/STATUS.md`: what is built, how to run it, the phase in progress, and the "Not yet verified" list.
- `docs/DECISIONS.md`: every choice the plan didn't make for you.
- `PLAN-EXPLORER.md`: a separate, later plan. Don't build any of it.

## Commands

- `supabase start`: the local database, auth and mail inbox
- `npm run db:reset`: rebuild and seed the local database
- `npm run seed:demo`: add the demo interviews for Session 1
- `npm run dev`: the app on port 3000
- `npm run check`: type check, lint and Vitest
- `npm run e2e`: Playwright, on its own server and database
- `npm run evals`: the eval sets, against the real model

## When all eight phases are done

Write a closing section in `docs/STATUS.md`: what was built, every criterion still unverified and what it needs, the decisions you made, and anything in the plan that turned out to be wrong or missing.
