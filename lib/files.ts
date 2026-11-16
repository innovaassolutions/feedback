// File checks shared by uploads. The type is decided from the bytes as well as the name, so a
// renamed executable doesn't pass as a PDF.

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export type DocumentKind = "pdf" | "docx" | "markdown" | "text" | "vtt" | "srt";

const DOCUMENT_EXTENSIONS: Record<string, DocumentKind> = {
  pdf: "pdf",
  docx: "docx",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  vtt: "vtt",
  srt: "srt",
};

export const DOCUMENT_MIME: Record<DocumentKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  markdown: "text/markdown",
  text: "text/plain",
  vtt: "text/vtt",
  srt: "application/x-subrip",
};

export const DOCUMENT_ACCEPT = ".pdf,.docx,.md,.markdown,.txt,.vtt,.srt";

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((b, i) => bytes[i] === b);
}

function isUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

/** The document kind, or null if the file isn't an accepted type. */
export function detectDocumentKind(name: string, bytes: Uint8Array): DocumentKind | null {
  const kind = DOCUMENT_EXTENSIONS[extensionOf(name)];
  if (!kind) return null;
  if (kind === "pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]) ? kind : null; // %PDF
  if (kind === "docx") return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ? kind : null; // zip
  if (!isUtf8Text(bytes)) return null;
  if (kind === "vtt") {
    const head = new TextDecoder().decode(bytes.slice(0, 16)).replace(/^﻿/, "");
    return head.startsWith("WEBVTT") ? kind : null;
  }
  if (kind === "srt") {
    // A subtitle file: numbered cues with "00:00:01,000 --> 00:00:04,000" timings.
    const head = new TextDecoder().decode(bytes.slice(0, 2048));
    return /\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}/.test(head) ? kind : null;
  }
  return kind;
}

export type LogoKind = "png" | "svg";

export function detectLogoKind(name: string, bytes: Uint8Array): LogoKind | null {
  const ext = extensionOf(name);
  if (ext === "png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? "png" : null;
  if (ext === "svg") {
    if (!isUtf8Text(bytes)) return null;
    const text = new TextDecoder().decode(bytes);
    return /<svg[\s>]/i.test(text) ? "svg" : null;
  }
  return null;
}

/**
 * Where a session document is stored: the organization, course and session folders (the storage
 * rules check the course folder), then the document's own folder. The browser and the server
 * build the same path, so the server never takes a path from the browser.
 */
export function documentStoragePath(ids: { organizationId: string; courseId: string; sessionId: string }, documentId: string, fileName: string): string {
  return `${ids.organizationId}/${ids.courseId}/${ids.sessionId}/${documentId}/${safeFileName(fileName)}`;
}

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "file";
}

/** An SVG that could run code when opened directly is refused. */
export function svgLooksUnsafe(bytes: Uint8Array): boolean {
  const text = new TextDecoder().decode(bytes).toLowerCase();
  return /<script|<foreignobject|\son[a-z]+\s*=|javascript:|<iframe|<embed|<object/.test(text);
}
