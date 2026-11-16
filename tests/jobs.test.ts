import { describe, expect, it } from "vitest";
import { processJobs, registerJob } from "@/lib/server/jobs/queue";
import { admin } from "./support/db";

describe("job queue", () => {
  it("claims a job again when its run was cut off, leaves a running job alone, and gives up after three attempts", async () => {
    const db = admin();
    const ran: string[] = [];
    registerJob("test_cut_off", async (p) => void ran.push(String(p.tag)));
    const now = new Date();
    const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
    const tag = `cut-off-${now.getTime()}`;
    const { data: rows, error } = await db
      .from("jobs")
      .insert([
        { kind: "test_cut_off", payload: { tag: `${tag}-stalled` }, status: "running", attempts: 1, updated_at: minutesAgo(20), run_after: minutesAgo(21) },
        { kind: "test_cut_off", payload: { tag: `${tag}-busy` }, status: "running", attempts: 1, updated_at: minutesAgo(2), run_after: minutesAgo(3) },
        { kind: "test_cut_off", payload: { tag: `${tag}-spent` }, status: "running", attempts: 3, updated_at: minutesAgo(20), run_after: minutesAgo(21) },
      ])
      .select("id, payload");
    expect(error).toBeNull();
    const idOf = (suffix: string) => rows!.find((r) => (r.payload as { tag: string }).tag === `${tag}-${suffix}`)!.id;

    await processJobs({ admin: db, now: () => now, mailer: { send: async () => {} } });

    expect(ran.filter((t) => t.startsWith(tag))).toEqual([`${tag}-stalled`]);
    const { data: after } = await db.from("jobs").select("id, status, attempts, last_error").in("id", rows!.map((r) => r.id));
    const byId = new Map(after!.map((r) => [r.id, r]));
    expect(byId.get(idOf("stalled"))).toMatchObject({ status: "done", attempts: 2 });
    expect(byId.get(idOf("busy"))).toMatchObject({ status: "running", attempts: 1 });
    expect(byId.get(idOf("spent"))).toMatchObject({ status: "failed", last_error: "Stopped while running" });
  });
});
