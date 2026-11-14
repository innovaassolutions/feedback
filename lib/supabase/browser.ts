"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

const LOOPBACK = new Set(["127.0.0.1", "localhost"]);

/**
 * The local Supabase address is 127.0.0.1, which on a phone trying the dev server over the
 * network means the phone itself. Then use the host the page came from, and keep the cookie name
 * the server uses so the session still matches.
 */
function connection(): { url: string; cookieName: string } {
  const configured = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const cookieName = `sb-${configured.hostname.split(".")[0]}-auth-token`;
  const url = new URL(configured);
  if (LOOPBACK.has(url.hostname) && !LOOPBACK.has(window.location.hostname)) url.hostname = window.location.hostname;
  return { url: url.origin, cookieName };
}

export function browserClient() {
  if (!client) {
    const { url, cookieName } = connection();
    client = createBrowserClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      cookieOptions: { name: cookieName },
    });
  }
  return client;
}
