import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/server";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const db = await createUserClient();
  const { data } = await db.auth.getUser();
  return data.user ?? null;
});

export function isPlatformAdmin(user: User | null): boolean {
  return user?.app_metadata?.platform_admin === true;
}

/**
 * Where a magic link lands: the confirm route on the address the person is using, so a link asked
 * for on a phone over the local network opens there too. The email template adds the token.
 */
export function signInRedirect(origin: string, next: string): string {
  return `${origin}/auth/confirm?next=${encodeURIComponent(safeNextPath(next))}`;
}

/** Only same-site paths, so a sign-in link can't send someone elsewhere. */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  try {
    const url = new URL(value, "http://local.invalid");
    if (url.origin !== "http://local.invalid" && !/^https?:\/\//.test(value)) return fallback;
    const path = url.pathname + url.search;
    return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
  } catch {
    return fallback;
  }
}
