import { emailLogoBySlug } from "@/lib/server/mail/brand";
import { adminClient } from "@/lib/server/supabase-admin";

/** An organization's logo as a PNG for email, where SVG doesn't show. Logos are public already. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const slug = /^([a-z0-9-]+)\.png$/.exec((await params).file)?.[1];
  const logo = slug ? await emailLogoBySlug(adminClient(), slug) : null;
  if (!logo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(logo.png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, s-maxage=86400" },
  });
}
