// npm run jobs: runs what the cron tick runs, once, against the database in .env.local.
import "./load-env";
import { adminClient } from "@/lib/server/supabase-admin";
import { mailer } from "@/lib/server/email";
import { runSchedule } from "@/lib/server/schedule";
import { runJobs } from "@/lib/server/jobs/run";

const deps = { admin: adminClient(), mailer: mailer(), now: () => new Date() };
console.log(JSON.stringify({ scheduled: await runSchedule(deps), jobs: await runJobs(deps) }, null, 2));
