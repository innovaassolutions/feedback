# Course Feedback Platform

Session-by-session feedback for training courses. Learners give feedback by talking to an AI interviewer (typing or speaking), ask questions that are answered from the course's own materials, and instructors see results within a day of each session. Multi-tenant from the start: each client organization has its own courses, data and branding.

- `PLAN.md`: what is built and how each part is checked.
- `docs/STATUS.md`: what's built, how to run it, and what hasn't been verified yet.
- `docs/DECISIONS.md`: every choice the plan didn't make.
- `docs/VOICE.md`: the voice integration and the trial still to run.
- `CLAUDE.md`: the working rules for the coding agent that builds this.

Next.js (App Router) · React · Tailwind · Supabase (Postgres, Auth, Storage, Realtime, pgvector) · Vercel · Vercel AI SDK · Vocal Bridge.

## The agents

Each has a folder under `agents/` with its versioned `AGENT.md`, its tools, its output schema and its evals.

- **Interviewer**: runs the feedback conversation.
- **Analyst**: turns a finished interview into themes, blockers, suggestions and quotes, and writes the session summary.
- **Librarian**: reads session documents and the product documentation, drafts the session brief, and answers Q&A questions with citations.
- **Brand designer**: proposes a theme from a logo.

Rules that must always hold (stages, limits, anonymity, citation, quote and contrast checks) are in code, not in the instructions.
