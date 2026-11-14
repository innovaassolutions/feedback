import { json } from "@/lib/server/route";
import { defaultDeps } from "@/lib/server/ctx";
import { runJobs } from "@/lib/server/jobs/run";
import { runSchedule } from "@/lib/server/schedule";

export const maxDuration = 300;

/** Called by Vercel Cron. Runs queued work and anything that has come due. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return json(401, { error: "Unauthorized" });
  const deps = defaultDeps();
  const scheduled = await runSchedule(deps);
  const jobs = await runJobs(deps, { maxJobs: 200 });
  return json(200, { scheduled, jobs });
}
