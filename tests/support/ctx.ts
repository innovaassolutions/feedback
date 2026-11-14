import type { Ctx, CookieJar } from "@/lib/server/ctx";
import type { Email, Mailer } from "@/lib/server/email";
import type { SeedUserKey } from "@/lib/server/seed";
import { runJobs } from "@/lib/server/jobs/run";
import { admin, signInAs } from "./db";

export type TestCtx = Ctx & { outbox: Email[]; jar: Map<string, string>; runJobs: () => Promise<{ ran: number; failed: number }> };

export function memoryJar(jar = new Map<string, string>()): CookieJar {
  return {
    get: (name) => jar.get(name),
    set: (name, value) => void jar.set(name, value),
    delete: (name) => void jar.delete(name),
  };
}

/** An operation context acting as a seeded user (or signed out), with mail kept in memory. */
export async function ctxAs(who: SeedUserKey | { email: string } | null, opts: { now?: () => Date; jar?: Map<string, string> } = {}): Promise<TestCtx> {
  const outbox: Email[] = [];
  const mailer: Mailer = { send: async (e) => void outbox.push(e) };
  const jar = opts.jar ?? new Map<string, string>();
  const now = opts.now ?? (() => new Date());
  let db;
  let user = null;
  if (who) {
    db = await signInAs(who);
    user = (await db.auth.getUser()).data.user;
  } else {
    const { createClient } = await import("@supabase/supabase-js");
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  }
  return {
    db: db as Ctx["db"],
    user,
    admin: admin(),
    now,
    origin: "http://localhost:3100",
    cookies: memoryJar(jar),
    defer: () => {},
    mailer,
    outbox,
    jar,
    runJobs: () => runJobs({ admin: admin(), now, mailer }),
  };
}

/** Runs an operation and returns the HTTP status it would produce. */
export async function statusOf(p: Promise<unknown>): Promise<number> {
  try {
    await p;
    return 200;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (typeof status === "number") return status;
    throw err;
  }
}
