import "./load-env";
import { adminClient } from "@/lib/server/supabase-admin";
import { seedDemoInterviews } from "@/lib/server/demo";
import { SEED_USERS, STREAMSPACE_LEARNERS } from "@/lib/server/seed";
import { writeSessionSummary } from "@/agents/analyst/summary";
import { mailer } from "@/lib/server/email";

const db = adminClient();
const { data: course } = await db.from("courses").select("id").eq("slug", "ime-engineering").single();
const { data: session } = await db.from("sessions").select("id").eq("course_id", course!.id).eq("number", 1).single();
const { count } = await db.from("interviews").select("id", { count: "exact", head: true }).eq("session_id", session!.id).neq("state", "in_progress");
if (count) {
  console.log(`Session 1 already has ${count} submitted interviews. Run npm run db:reset first.`);
  process.exit(1);
}
const learners: string[] = [];
for (const key of STREAMSPACE_LEARNERS.slice(0, 7)) {
  const { data } = await db.rpc("user_id_by_email", { p_email: SEED_USERS[key].email });
  learners.push(data!);
}
await seedDemoInterviews(db, session!.id, learners);
await writeSessionSummary({ session_id: session!.id }, { admin: db, now: () => new Date(), mailer: mailer() });
console.log("Added 7 submitted interviews to Session 1: 3 named, 3 anonymous and 1 private");
