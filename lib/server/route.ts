import "server-only";
import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { operations, type OperationInput, type OperationName } from "@/lib/operations";
import { createUserClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/server/supabase-admin";
import { mailer } from "@/lib/server/email";
import { HttpError } from "@/lib/server/http";
import { errorName } from "@/lib/server/ai/runs";
import { requestOrigin } from "@/lib/request";
import type { Ctx } from "@/lib/server/ctx";

export async function requestCtx(): Promise<Ctx> {
  const db = await createUserClient();
  const { data } = await db.auth.getUser();
  const store = await cookies();
  const origin = await requestOrigin();
  return {
    db,
    user: data.user ?? null,
    admin: adminClient(),
    now: () => new Date(),
    origin,
    cookies: {
      get: (name) => store.get(name)?.value,
      set: (name, value, options) =>
        store.set(name, value, { ...options, httpOnly: true, sameSite: "lax", secure: origin.startsWith("https://") }),
      delete: (name) => store.delete(name),
    },
    defer: (task) => after(task),
    mailer: mailer(),
  };
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method === "GET" || req.method === "DELETE") return {};
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const out: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) out[key] = value;
    return out;
  }
  const text = await req.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new HttpError(400, "The request body isn't valid JSON");
  }
}

export function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/**
 * Wraps an operation as a route handler: builds the context, validates the input against the
 * operation's schema (422 if it doesn't match), and turns HttpErrors into responses.
 */
export function handle<N extends OperationName>(
  name: N,
  fn: (ctx: Ctx, input: OperationInput<N>) => Promise<unknown>,
  successStatus = 200,
) {
  return async (req: Request, context: { params: Promise<Record<string, string>> }) => {
    try {
      const params = await context.params;
      // Path parameters win, so a body can't point an operation at another record.
      const raw = { ...(await readBody(req)), ...params };
      const parsed = operations[name].input.safeParse(raw);
      if (!parsed.success) {
        return json(422, {
          error: "Some of the input isn't valid",
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      const ctx = await requestCtx();
      const result = await fn(ctx, parsed.data as OperationInput<N>);
      return json(successStatus, result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message, ...err.details });
      console.error(`[${name}] failed: ${errorName(err)}`);
      return json(500, { error: "Something went wrong. Try again." });
    }
  };
}
