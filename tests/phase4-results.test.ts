import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getSessionQuotes, getSessionResults, listInterviews, recordAction, shuffle } from "@/lib/server/ops/results";
import { createSession, setSessionState } from "@/lib/server/ops/sessions";
import { startInterview, sendTurn } from "@/lib/server/ops/interviews";
import { seedDemoInterviews, DEMO_INTERVIEWS } from "@/lib/server/demo";
import { writeSessionSummary } from "@/agents/analyst/summary";
import { overrideStubBrain } from "@/lib/server/ai/models";
import { loadSetup } from "@/lib/server/interviews/setup";
import { STREAMSPACE_LEARNERS } from "@/lib/server/seed";
import { admin, seeded, sql, userId } from "./support/db";
import { ctxAs, statusOf } from "./support/ctx";
import { openSession } from "./support/interview";

let ids: Awaited<ReturnType<typeof seeded>>;
let learners: string[];
beforeAll(async () => {
  ids = await seeded();
  learners = await Promise.all(STREAMSPACE_LEARNERS.slice(0, 7).map((k) => userId(k)));
});
afterEach(() => overrideStubBrain("analyst", null));

async function demoSession(title: string, count = 7) {
  const s = await openSession(title);
  await seedDemoInterviews(admin(), s.id, learners);
  if (count < 7) {
    // Keep the three named interviews and as many anonymous ones as needed to reach `count`.
    await sql()`delete from public.interviews where session_id = ${s.id} and anonymity = 'private'`;
    const extra = await sql()`select id from public.interviews where session_id = ${s.id} and anonymity = 'anonymous' limit ${6 - count}`;
    for (const r of extra) await sql()`delete from public.interviews where id = ${r.id}`;
  }
  return s;
}

describe("session results", () => {
  it("show Responses 7 of the enrolled, Able to apply 5 of 7, Pace about right 4 of 7 and Recommend 7.7, with no NPS", async () => {
    const s = await demoSession("Demo results");
    const [{ n: enrolled }] = await sql()`select count(*)::int as n from public.enrollments where course_id = ${ids.ime}`;
    const r = await getSessionResults(await ctxAs("marcus"), { session_id: s.id });
    expect(r.hidden).toBe(false);
    expect(r.tiles!.responses).toMatchObject({ count: 7, of: enrolled });
    expect(r.tiles!.able).toMatchObject({ count: 5, of: 7 });
    expect(r.tiles!.pace).toMatchObject({ count: 4, of: 7 });
    expect(r.tiles!.recommend.average).toBe(7.7);
    expect(r.tiles!.nps).toBeNull();
    expect(r.charts!.themes.length).toBeGreaterThan(0);
    expect(r.quotes!.length).toBe(6);
  });

  it("with four submitted interviews, return only the count", async () => {
    const s = await demoSession("Four only", 4);
    const r = await getSessionResults(await ctxAs("marcus"), { session_id: s.id });
    expect(r.hidden).toBe(true);
    expect(r.responses).toBe(4);
    expect(r).not.toHaveProperty("tiles");
    expect(r).not.toHaveProperty("quotes");
    expect(r).not.toHaveProperty("charts");
    // Even reading the rows directly as the instructor gets no anonymous ones below the threshold.
    const marcus = await ctxAs("marcus");
    const { data } = await marcus.db.from("interviews").select("id, anonymity").eq("session_id", s.id);
    expect((data ?? []).map((d) => d.anonymity).sort()).toEqual(["named", "named", "named"]);
  });

  it("are refused to learners", async () => {
    expect(await statusOf(getSessionResults(await ctxAs("hamish"), { session_id: ids.s1 }))).toBe(403);
  });
});

describe("the transcript list", () => {
  it("has three named interviews with names, three anonymous ones with no name, id or time, and never the private one", async () => {
    const s = await demoSession("Transcripts");
    const list = await listInterviews(await ctxAs("marcus"), { session_id: s.id }, { seed: 7 });
    expect(list.named.map((n) => n.name)).toEqual(["Aisha Bello", "Ben Carter", "Chloe Nakamura"]);
    expect(list.anonymous.length).toBe(3);
    for (const a of list.anonymous) {
      expect(Object.keys(a).sort()).toEqual(["insights", "ratings", "state", "summary", "turns"]);
      expect(JSON.stringify(a)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    }
    const all = JSON.stringify(list);
    expect(all).not.toContain("Unsure who to ask"); // the private interview's paraphrase
  });

  it("with a fixed shuffle seed, doesn't return the anonymous ones in submission order", async () => {
    const s = await demoSession("Shuffle");
    const submissionOrder = DEMO_INTERVIEWS.filter((d) => d.anonymity === "anonymous").map((d) => d.summary[0]);
    const list = await listInterviews(await ctxAs("marcus"), { session_id: s.id }, { seed: 7 });
    const returned = list.anonymous.map((a) => a.summary[0]);
    expect(returned.sort()).toEqual([...submissionOrder].sort());
    const again = (await listInterviews(await ctxAs("marcus"), { session_id: s.id }, { seed: 7 })).anonymous.map((a) => a.summary[0]);
    expect(again).not.toEqual(submissionOrder);
    expect(shuffle([0, 1, 2], 7)).not.toEqual([0, 1, 2]);
  });
});

describe("sponsors", () => {
  it("see the tiles, charts, themes and actions, and get 404 for transcripts and quotes", async () => {
    const s = await demoSession("Sponsor view");
    const priya = await ctxAs("priya");
    const r = await getSessionResults(priya, { session_id: s.id });
    expect(r.tiles!.able.count).toBe(5);
    expect(r.charts!.themes.length).toBeGreaterThan(0);
    expect(r).not.toHaveProperty("quotes");
    expect(r.blockers).toEqual([]);
    expect(await statusOf(listInterviews(priya, { session_id: s.id }))).toBe(404);
    expect(await statusOf(getSessionQuotes(priya, s.id))).toBe(404);
    const { data: rows } = await priya.db.from("insights").select("id").eq("session_id", s.id);
    expect(rows).toEqual([]);
  });
});

describe("the session summary", () => {
  it("is replaced by the template when it contains a number that wasn't passed in", async () => {
    const s = await demoSession("Summary check");
    overrideStubBrain("analyst", () => ({ text: JSON.stringify({ summary: "Nine out of 12 learners loved it, a 94% success rate." }) }));
    const deps = { admin: admin(), now: () => new Date(), mailer: { send: async () => {} } };
    const chosen = await writeSessionSummary({ session_id: s.id }, deps);
    expect(chosen?.source).toBe("template");
    const [row] = await sql()`select summary, summary_source from public.sessions where id = ${s.id}`;
    expect(row.summary_source).toBe("template");
    expect(row.summary).toMatch(/^7 of \d+ learners responded\./);

    overrideStubBrain("analyst", null);
    const good = await writeSessionSummary({ session_id: s.id }, deps);
    expect(good?.source).toBe("analyst");
  });
});

describe("You said, we did", () => {
  it("an action on one session appears on the next session's page and in the Interviewer's context there", async () => {
    const marcus = await ctxAs("marcus");
    const first = await openSession("Before");
    const { session: second } = await createSession(marcus, { course_id: ids.ime, title: "After", date: "2026-12-11", objectives: "" });
    await setSessionState(marcus, { session_id: second.id, state: "scheduled" });
    await setSessionState(marcus, { session_id: second.id, state: "open" });
    expect(second.number).toBe(first.number + 1);

    await recordAction(marcus, { session_id: first.id, you_said: "The Core Agent part felt rushed", we_did: "We added a ten-minute recap", status: "done" });
    expect(await statusOf(recordAction(await ctxAs("priya"), { session_id: first.id, you_said: "x", we_did: "y", status: "done" }))).toBe(403);

    // The learner's page for the next session reads the previous session's actions.
    const learner = await ctxAs("aisha");
    const { data: visible } = await learner.db.from("actions").select("you_said, we_did").eq("session_id", first.id);
    expect(visible).toEqual([{ you_said: "The Core Agent part felt rushed", we_did: "We added a ten-minute recap" }]);

    // The Interviewer's context for the next session includes it, and a topic asks about it.
    let seen: unknown = null;
    overrideStubBrain("interviewer", (call) => {
      seen = call.context.changes_since_last_session;
      return { text: JSON.stringify({ reply: "Thanks. Next?", topic_action: "stay", learner_declined: false, offered_to_post_question: false }) };
    });
    const { interview } = await startInterview(learner, { session_id: second.id, anonymity: "anonymous", kind: "session" });
    const [iv] = await sql()`select * from public.interviews where id = ${interview.id}`;
    const setup = await loadSetup(admin(), iv as never);
    expect(setup.actions).toEqual([{ you_said: "The Core Agent part felt rushed", we_did: "We added a ten-minute recap" }]);
    expect((iv.progress as { topics: Array<{ id: string }> }).topics.map((t) => t.id)).toContain("last_changes");
    await sendTurn(learner, { interview_id: interview.id, text: "Ready", mode: "text" });
    await sendTurn(learner, { interview_id: interview.id, text: "Yes, without help", mode: "text" });
    // Framed as the group's feedback, so the Interviewer doesn't tell this learner "you said".
    expect(seen).toEqual([{ feedback_from_learners: "The Core Agent part felt rushed", what_changed: "We added a ten-minute recap" }]);
    overrideStubBrain("interviewer", null);
  });
});
