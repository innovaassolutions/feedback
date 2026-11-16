// Reading a pasted list of learners. The roster form splits the list before sending it, and the
// server reads each entry; both use these, so they agree.

const ADDRESS = /[^\s<>,;"'()[\]]+@[^\s<>,;"'()[\]]+\.[^\s<>,;"'()[\]]+/g;

/**
 * One entry per line or semicolon. A comma separates entries only when a piece holds more than one
 * address, so "Smith, Jane <jane@example.com>" stays one entry while "a@x.com, b@y.com" is two.
 */
export function splitPasted(text: string): string[] {
  return text
    .split(/[\r\n;]+/)
    .flatMap((part) => ((part.match(ADDRESS) ?? []).length > 1 ? part.split(",") : [part]))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The address and name in one entry: "Ada Lovelace <ada@example.com>", "Lovelace, Ada <ada@…>",
 * a name and an address copied from two spreadsheet columns, or just the address.
 */
export function readInvitee(entry: string): { email: string; name: string } | null {
  const found = entry.match(ADDRESS);
  if (!found || found.length !== 1) return null;
  const email = found[0].toLowerCase();
  const given = entry
    .replace(found[0], " ")
    .replace(/[<>"]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,:-]+|[\s,:-]+$/g, "")
    .trim();
  const name =
    given ||
    email
      .split("@")[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join(" ");
  return { email, name };
}
