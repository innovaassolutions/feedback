import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import type { Database } from "@/lib/database.types";
import { SEED_USERS, type SeedUserKey } from "@/lib/server/seed";
import { adminClient } from "@/lib/server/supabase-admin";

export type UserClient = SupabaseClient<Database>;

/** The secret-key client from lib/server, pointed at the test stack by the test environment. */
export function admin(): SupabaseClient<Database> {
  return adminClient();
}

let sqlSingleton: ReturnType<typeof postgres> | null = null;
/** A direct database connection, for catalog checks and arranging state. */
export function sql() {
  sqlSingleton ??= postgres(process.env.SUPABASE_DB_URL!, { max: 2, onnotice: () => {} });
  return sqlSingleton;
}

/** Signs in as a user the way a magic link would, and returns a client acting as them. */
export async function signInAs(who: SeedUserKey | { email: string }): Promise<UserClient> {
  const email = typeof who === "string" ? SEED_USERS[who].email : who.email;
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await client.auth.verifyOtp({ type: "email", token_hash: data.properties.hashed_token });
  if (verified.error) throw verified.error;
  return client;
}

export async function userId(who: SeedUserKey): Promise<string> {
  const rows = await sql()`select id from auth.users where email = ${SEED_USERS[who].email}`;
  return rows[0].id as string;
}

export async function seeded() {
  const s = sql();
  const orgs = await s`select id, slug from public.organizations`;
  const courses = await s`select id, slug from public.courses`;
  const sessions = await s`select s.id, s.number, c.slug as course from public.sessions s join public.courses c on c.id = s.course_id`;
  const org = (slug: string) => orgs.find((o) => o.slug === slug)!.id as string;
  const course = (slug: string) => courses.find((c) => c.slug === slug)!.id as string;
  const session = (courseSlug: string, n: number) => sessions.find((x) => x.course === courseSlug && x.number === n)!.id as string;
  return {
    streamspace: org("streamspace"),
    northwind: org("northwind"),
    ime: course("ime-engineering"),
    nwCourse: course("customer-onboarding"),
    s1: session("ime-engineering", 1),
    s2: session("ime-engineering", 2),
    s3: session("ime-engineering", 3),
    nw1: session("customer-onboarding", 1),
  };
}
