import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Sealed references let an instructor act on an anonymous interview (mark its insights, retry its
// analysis) without the page ever holding its id. Each seal uses a fresh IV, so the same
// interview gets a different reference every time and references can't be matched up.

function key(): Buffer {
  const secret = process.env.REVIEW_REF_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("No secret for sealed references");
  return createHash("sha256").update(`interview-ref:${secret}`).digest();
}

export function sealRef(id: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(id, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openRef(ref: string): string | null {
  try {
    const raw = Buffer.from(ref, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const id = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return /^[0-9a-f-]{36}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
