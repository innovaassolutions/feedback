export type Chunk = { content: string; heading: string | null; index: number };

const TARGET = 1100;
const MAX = 1600;

/**
 * Removes the control characters Postgres text can't hold (NUL fails with 22P05) or that carry
 * no meaning. Real pages and PDF extraction both produce them. Tabs and line breaks stay.
 */
export function storableText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/**
 * Splits text into chunks of about a thousand characters on paragraph boundaries, carrying
 * the latest heading so each chunk says what part of the document it came from.
 */
export function chunkText(text: string): Chunk[] {
  const paragraphs = storableText(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  let heading: string | null = null;
  let current: string[] = [];
  let currentHeading: string | null = null;
  let size = 0;

  const flush = () => {
    if (!current.length) return;
    chunks.push({ content: current.join("\n\n"), heading: currentHeading, index: chunks.length });
    // Keep the last paragraph as overlap when it is short, so a step split across chunks survives.
    const last = current[current.length - 1];
    current = last.length < 300 ? [last] : [];
    size = current.reduce((s, p) => s + p.length, 0);
  };

  for (const para of paragraphs) {
    const h = /^#{1,6}\s+(.+)$/m.exec(para);
    if (h && para.split("\n").length === 1) {
      flush();
      current = [];
      size = 0;
      heading = h[1].trim();
    }
    if (!current.length) currentHeading = heading;
    // Very long paragraphs are cut on sentence ends.
    const pieces = para.length > MAX ? para.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [para] : [para];
    for (const piece of pieces) {
      if (size + piece.length > TARGET && size > 0) {
        flush();
        currentHeading = heading;
      }
      current.push(piece.trim());
      size += piece.length;
    }
  }
  if (current.length && !(chunks.length && current.length === 1 && chunks[chunks.length - 1].content.endsWith(current[0]))) {
    chunks.push({ content: current.join("\n\n"), heading: currentHeading, index: chunks.length });
  }
  return chunks;
}
