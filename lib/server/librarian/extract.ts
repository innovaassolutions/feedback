import type { DocumentKind } from "@/lib/files";

/** Raised when a file can't be read. The message is shown to the instructor. */
export class UnreadableDocument extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableDocument";
  }
}

export function vttToText(vtt: string): string {
  const lines = vtt.replace(/^﻿/, "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("WEBVTT")) continue;
    if (line.startsWith("NOTE") || line.startsWith("STYLE") || line.startsWith("REGION")) {
      skipping = true;
      continue;
    }
    if (!line) {
      skipping = false;
      continue;
    }
    if (skipping) continue;
    if (/-->/.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    out.push(line.replace(/<v\s+([^>]+)>/g, "$1: ").replace(/<[^>]+>/g, ""));
  }
  return out.join("\n");
}

export async function extractText(kind: DocumentKind, bytes: Uint8Array): Promise<string> {
  let text = "";
  try {
    if (kind === "pdf") {
      const { getDocumentProxy, extractText: pdfText } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const result = await pdfText(pdf, { mergePages: false });
      text = (Array.isArray(result.text) ? result.text : [result.text]).join("\n\n");
    } else if (kind === "docx") {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = result.value;
    } else if (kind === "vtt") {
      text = vttToText(new TextDecoder().decode(bytes));
    } else {
      text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
    }
  } catch {
    const label = kind === "pdf" ? "PDF" : kind === "docx" ? "Word document" : "file";
    throw new UnreadableDocument(`We couldn't read this ${label}. It may be damaged or password-protected. Try saving it again and re-uploading.`);
  }
  text = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 20) {
    throw new UnreadableDocument("We couldn't find any text in this file. If it's a scanned PDF, upload a version with selectable text.");
  }
  return text;
}
