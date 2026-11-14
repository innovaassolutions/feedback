import "./load-env";
import { adminClient } from "@/lib/server/supabase-admin";
import { seed } from "@/lib/server/seed";

const result = await seed(adminClient());
const c = result.counts;
console.log(`Seeded ${c.organizations} organizations, ${c.courses} courses, ${c.sessions} sessions and ${c.users} users`);
