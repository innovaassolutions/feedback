import { describe, expect, it } from "vitest";
import { sql } from "./support/db";

describe("row level security", () => {
  it("is on for every table in public", async () => {
    const rows = await sql()`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("covers the 22 tables in the plan", async () => {
    const rows = await sql()`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`;
    const names = rows.map((r) => r.relname);
    for (const t of [
      "organizations", "themes", "memberships", "courses", "enrollments", "sessions", "documents",
      "documentation_sources", "document_chunks", "guides", "interviews", "interview_turns", "ratings",
      "insights", "completions", "questions", "answers", "question_votes", "actions", "agent_runs",
      "quality_checks", "jobs",
    ]) expect(names).toContain(t);
  });
});
