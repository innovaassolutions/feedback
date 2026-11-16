// The short names in the platform's web addresses: an organization's (/streamspace) and a course's
// (/streamspace/ime-engineering). They're permanent, since links, emails and QR codes use them.

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

/** First parts of the platform's own addresses, which an organization or course can't use. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(["platform", "sign-in", "auth", "api", "settings", "admin", "dashboard", "docs", "_next", "static"]);

const usable = (s: string) => SLUG_PATTERN.test(s) && !RESERVED_SLUGS.has(s);

/** What someone most likely meant: "www.streamspace.ai" → "streamspace", "Stream Space" → "stream-space". */
function suggestionFor(raw: string, looksLikeWebsite: boolean): string | null {
  let s = raw.trim().toLowerCase();
  if (looksLikeWebsite) {
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    const [host, ...path] = s.split(/[/?#]/);
    const lastSegment = path.filter(Boolean).pop();
    // A pasted platform link ends with the name; a website's name is the first part of its domain.
    s = lastSegment ?? host.replace(/^www\./, "").split(".")[0];
  }
  const candidate = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "");
  return usable(candidate) ? candidate : null;
}

/** A short name made from a title or a website address, if one can be made. */
export function suggestSlug(text: string): string | null {
  return suggestionFor(text, /[./:]/.test(text));
}

export type SlugResult = { ok: true; slug: string } | { ok: false; message: string; suggestion: string | null };

/** Checks a short name for a web address, and suggests one when it won't do. */
export function parseSlug(input: unknown): SlugResult {
  const raw = String(input ?? "").trim();
  const slug = raw.toLowerCase();
  if (SLUG_PATTERN.test(slug)) {
    return RESERVED_SLUGS.has(slug) ? { ok: false, message: `"${slug}" is used by the platform itself. Choose another.`, suggestion: null } : { ok: true, slug };
  }
  if (!raw) return { ok: false, message: "Enter a short name, such as acme.", suggestion: null };
  const suggestion = suggestSlug(raw);
  return /[./:]/.test(raw)
    ? { ok: false, message: "That's a website address. Enter a short name instead.", suggestion }
    : { ok: false, message: "Use 3 to 50 lowercase letters, numbers and hyphens.", suggestion };
}

/** The message for a form that was sent anyway. */
export function slugErrorMessage(result: Extract<SlugResult, { ok: false }>): string {
  return `Web address: ${result.message}${result.suggestion ? ` Try "${result.suggestion}".` : ""}`;
}
