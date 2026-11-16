import "./load-env";
import { adminClient } from "@/lib/server/supabase-admin";

// Creates a platform admin account, or makes an existing account one. A new production database
// starts with this one account; organizations, courses and everyone else are created in the app.
//
//   npx tsx scripts/create-platform-admin.ts someone@example.com
//
// It acts on the database in .env.local, or on the one in the file FEEDBACK_ENV_FILE names.

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("Usage: npx tsx scripts/create-platform-admin.ts <email>");
  process.exit(1);
}

const db = adminClient();
const { data: existing, error: lookup } = await db.rpc("user_id_by_email", { p_email: email });
if (lookup) throw new Error(`lookup: ${lookup.message}`);

if (existing) {
  const { data: user } = await db.auth.admin.getUserById(existing);
  const { error } = await db.auth.admin.updateUserById(existing, {
    app_metadata: { ...(user.user?.app_metadata ?? {}), platform_admin: true },
  });
  if (error) throw new Error(`update: ${error.message}`);
  console.log(`${email} is now a platform admin.`);
} else {
  const { error } = await db.auth.admin.createUser({ email, email_confirm: true, app_metadata: { platform_admin: true } });
  if (error) throw new Error(`create: ${error.message}`);
  console.log(`Created the platform admin ${email}. They sign in with a link sent to that address.`);
}
