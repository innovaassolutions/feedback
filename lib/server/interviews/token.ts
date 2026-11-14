import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Ctx } from "@/lib/server/ctx";
import { unauthorized } from "@/lib/server/http";
import type { Tables } from "@/lib/database.types";

// An interview is authorized by a random token in an httpOnly cookie. Only its hash is stored.
// This is what lets an anonymous interview be written to without linking it to the learner.

export const TOKEN_MAX_AGE = 24 * 60 * 60;
export const interviewCookie = (id: string) => `iv_${id.replace(/-/g, "")}`;

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, hash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function authorizeInterview(ctx: Ctx, interviewId: string): Promise<Tables<"interviews">> {
  const token = ctx.cookies.get(interviewCookie(interviewId));
  if (!token) throw unauthorized("This interview has expired in this browser. Start again from the session page.");
  const { data } = await ctx.admin.from("interviews").select("*").eq("id", interviewId).maybeSingle();
  if (!data || !tokenMatches(token, data.token_hash)) throw unauthorized("This interview has expired in this browser. Start again from the session page.");
  return data;
}
