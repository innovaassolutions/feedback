import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * The secret-key client. It bypasses Row Level Security, so it is used only here in lib/server/:
 * seeding, background jobs, and writes to interviews authorized by an interview token.
 */
let admin: SupabaseClient<Database> | null = null;

export function adminClient(): SupabaseClient<Database> {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
    admin = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

export type AdminClient = SupabaseClient<Database>;
