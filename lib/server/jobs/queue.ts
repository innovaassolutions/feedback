import type { AdminClient } from "@/lib/server/supabase-admin";
import type { Mailer } from "@/lib/server/email";
import type { Json, Tables } from "@/lib/database.types";
import { errorName } from "@/lib/server/ai/runs";

export type JobDeps = { admin: AdminClient; now: () => Date; mailer: Mailer };
export type JobRow = Tables<"jobs">;
type Handler = (payload: Record<string, unknown>, deps: JobDeps, job: JobRow) => Promise<void>;

const handlers = new Map<string, Handler>();

export function registerJob(kind: string, handler: Handler) {
  handlers.set(kind, handler);
}

export async function enqueue(
  admin: AdminClient,
  job: { kind: string; payload: Record<string, unknown>; organizationId: string | null; runAfter?: Date; dedupeKey?: string },
): Promise<boolean> {
  const { error } = await admin.from("jobs").insert({
    kind: job.kind,
    payload: job.payload as Json,
    organization_id: job.organizationId,
    run_after: (job.runAfter ?? new Date()).toISOString(),
    dedupe_key: job.dedupeKey ?? null,
  });
  if (error) {
    if (error.code === "23505") return false; // already queued: dedupe key taken
    throw new Error(`enqueue ${job.kind}: ${error.message}`);
  }
  return true;
}

const MAX_ATTEMPTS = 3;

/** Runs due jobs until none are left or `maxJobs` have run. */
export async function processJobs(deps: JobDeps, opts: { maxJobs?: number } = {}) {
  const max = opts.maxJobs ?? 100;
  let ran = 0;
  let failed = 0;
  while (ran < max) {
    const { data: jobs, error } = await deps.admin.rpc("claim_jobs", { p_limit: Math.min(10, max - ran), p_now: deps.now().toISOString() });
    if (error) throw new Error(`claim_jobs: ${error.message}`);
    if (!jobs?.length) break;
    for (const job of jobs) {
      ran++;
      const handler = handlers.get(job.kind);
      try {
        if (!handler) throw new Error(`No handler for job kind ${job.kind}`);
        await handler((job.payload ?? {}) as Record<string, unknown>, deps, job);
        await deps.admin.from("jobs").update({ status: "done", updated_at: deps.now().toISOString(), last_error: null }).eq("id", job.id);
      } catch (err) {
        failed++;
        const retry = job.attempts < MAX_ATTEMPTS;
        const runAfter = new Date(deps.now().getTime() + 30_000 * job.attempts);
        await deps.admin
          .from("jobs")
          .update({
            status: retry ? "queued" : "failed",
            run_after: retry ? runAfter.toISOString() : job.run_after,
            last_error: errorName(err),
            updated_at: deps.now().toISOString(),
          })
          .eq("id", job.id);
        console.error(`[job ${job.kind}] ${errorName(err)}`);
      }
    }
  }
  return { ran, failed };
}

/**
 * Records that something happened once, such as a reminder sent. Returns false if it was already
 * recorded. Uses the jobs table's unique dedupe key, as a finished marker row.
 */
export async function markOnce(admin: AdminClient, key: string, organizationId: string | null, kind = "marker"): Promise<boolean> {
  const { error } = await admin.from("jobs").insert({ kind, payload: {}, organization_id: organizationId, status: "done", dedupe_key: key });
  if (error) {
    if (error.code === "23505") return false;
    throw new Error(`markOnce: ${error.message}`);
  }
  return true;
}
