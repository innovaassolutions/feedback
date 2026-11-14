import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { adminClient, type AdminClient } from "@/lib/server/supabase-admin";
import { mailer, type Mailer } from "@/lib/server/email";
import { unauthorized } from "@/lib/server/http";

export type CookieJar = {
  get(name: string): string | undefined;
  set(name: string, value: string, options: { maxAge: number; path: string }): void;
  delete(name: string): void;
};

/**
 * Everything an operation needs. Route handlers build it from the request; tests build it
 * directly, so the same code runs in both.
 */
export type Ctx = {
  /** Acts as the signed-in user, so Row Level Security applies. */
  db: SupabaseClient<Database>;
  user: User | null;
  /** The secret-key client: background jobs and token-authorized interview writes only. */
  admin: AdminClient;
  now: () => Date;
  origin: string;
  cookies: CookieJar;
  /** Runs work after the response is sent. */
  defer: (task: () => Promise<unknown>) => void;
  mailer: Mailer;
};

export function requireUser(ctx: Ctx): User {
  if (!ctx.user) throw unauthorized();
  return ctx.user;
}

export function defaultDeps() {
  return { admin: adminClient(), mailer: mailer(), now: () => new Date() };
}
