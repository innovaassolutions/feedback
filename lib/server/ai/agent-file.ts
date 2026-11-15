import { readFileSync } from "node:fs";
import path from "node:path";

export type AgentFolder = "interviewer" | "analyst" | "librarian" | "brand-designer";
export type AgentFile = { name: string; version: string; instructions: string };

const cache = new Map<AgentFolder, AgentFile>();

/** Reads agents/<name>/AGENT.md: front matter with a version, then the instructions. */
export function parseAgentFile(raw: string): AgentFile {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw.replace(/\r\n/g, "\n"));
  if (!m) throw new Error("AGENT.md must start with front matter");
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^(\w+):\s*(.+)$/.exec(line.trim());
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  if (!meta.version || !/^\d+\.\d+\.\d+$/.test(meta.version)) throw new Error("AGENT.md needs a version such as 1.0.0");
  return { name: meta.agent ?? "", version: meta.version, instructions: m[2].trim() };
}

/**
 * Cached in production, where an AGENT.md only changes with a deploy. In development it's read on
 * every call, so an edit takes effect without restarting `npm run dev`.
 */
export function loadAgentFile(folder: AgentFolder): AgentFile {
  const hit = process.env.NODE_ENV === "production" ? cache.get(folder) : undefined;
  if (hit) return hit;
  const file = parseAgentFile(readFileSync(path.join(process.cwd(), "agents", folder, "AGENT.md"), "utf8"));
  cache.set(folder, file);
  return file;
}
