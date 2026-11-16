import { createHash } from "node:crypto";
import { parse, type HTMLElement } from "node-html-parser";
import robotsParser from "robots-parser";
import type { JobDeps } from "@/lib/server/jobs/queue";
import { enqueue } from "@/lib/server/jobs/queue";
import { chunkText, storableText } from "@/lib/server/librarian/chunk";
import { errorName } from "@/lib/server/ai/runs";
import { embedTexts } from "./reading";
import { toVector } from "./tools";

/** Job: an instructor's written or verified answer becomes a source; anything else stops being one. */
export async function indexVerifiedAnswer(payload: { answer_id: string }, deps: JobDeps) {
  const db = deps.admin;
  const { data: a } = await db
    .from("answers")
    .select("id, organization_id, course_id, session_id, text, verified, questions!inner(text)")
    .eq("id", payload.answer_id)
    .maybeSingle();
  await db.from("document_chunks").delete().eq("answer_id", payload.answer_id);
  if (!a || !a.verified) return;
  const content = `Question: ${a.questions.text}\nAnswer: ${a.text}`;
  const [embedding] = await embedTexts(db, [content], { organizationId: a.organization_id, operation: "embed_verified_answer", sessionId: a.session_id });
  const { error } = await db.from("document_chunks").insert({
    organization_id: a.organization_id,
    course_id: a.course_id,
    session_id: a.session_id,
    source_kind: "verified_answer",
    answer_id: a.id,
    title: `Verified answer: ${a.questions.text.slice(0, 80)}`,
    content,
    embedding: toVector(embedding),
  });
  if (error) throw new Error(`index answer: ${error.code}`);
}

export const USER_AGENT = "CourseFeedbackLibrarian/1.0";
export const MAX_PAGES = 500;
const MAX_BYTES = 2 * 1024 * 1024;

export type Fetcher = (url: string) => Promise<Response>;
const defaultFetcher: Fetcher = (url) => fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });

function normalize(url: URL): string {
  const u = new URL(url.toString());
  u.hash = "";
  u.search = "";
  return u.toString();
}

/** Only pages on the same host, under the address given. */
export function inScope(candidate: URL, root: URL): boolean {
  if (candidate.protocol !== "https:" && candidate.protocol !== "http:") return false;
  if (candidate.host !== root.host) return false;
  const base = root.pathname.endsWith("/") ? root.pathname : root.pathname.replace(/\/[^/]*$/, "/");
  return candidate.pathname === root.pathname || candidate.pathname.startsWith(base);
}

export function pageText(html: string): { title: string; text: string; links: string[] } {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false, pre: true } });
  const links = root.querySelectorAll("a[href]").map((a) => a.getAttribute("href") ?? "").filter(Boolean);
  const title = storableText(root.querySelector("h1")?.text ?? root.querySelector("title")?.text ?? "").trim();
  for (const sel of ["nav", "header", "footer", "aside", "script", "style", "noscript", "svg"]) root.querySelectorAll(sel).forEach((n) => n.remove());
  const main: HTMLElement = root.querySelector("main") ?? root.querySelector("article") ?? root.querySelector("body") ?? root;
  const blocks = main
    .querySelectorAll("h1, h2, h3, h4, p, li, pre, td, th, dt, dd")
    .map((n) => {
      const t = n.text.replace(/\s+/g, " ").trim();
      return /^h[1-4]$/i.test(n.tagName) ? `## ${t}` : t;
    })
    .filter(Boolean);
  const text = blocks.length ? blocks.join("\n\n") : main.text.replace(/\s+/g, " ").trim();
  return { title, text, links };
}

/**
 * Job: reads an organization's documentation site page by page into its sources. A second read
 * updates changed pages and drops removed ones.
 */
export async function readDocumentation(payload: { source_id: string }, deps: JobDeps, fetcher: Fetcher = defaultFetcher) {
  const db = deps.admin;
  const { data: source } = await db.from("documentation_sources").select("*").eq("id", payload.source_id).maybeSingle();
  if (!source) return;
  try {
    const root = new URL(source.url);
    let robots: ReturnType<typeof robotsParser> | null = null;
    try {
      const res = await fetcher(new URL("/robots.txt", root).toString());
      if (res.ok) robots = robotsParser(new URL("/robots.txt", root).toString(), await res.text());
    } catch {
      robots = null;
    }
    const allowed = (url: string) => (robots ? robots.isAllowed(url, USER_AGENT) !== false : true);

    const start = normalize(root);
    const queue = [start];
    const visited = new Set<string>(queue);
    const pages = new Map<string, { title: string; text: string; hash: string }>();
    // Why the address itself gave nothing, said to the admin if no page at all could be read.
    let startProblem: string | null = null;
    while (queue.length && pages.size < MAX_PAGES) {
      const url = queue.shift()!;
      const first = url === start;
      if (!allowed(url)) {
        if (first) startProblem = "The site's robots.txt asks readers like this one not to read these pages.";
        continue;
      }
      let res: Response;
      try {
        res = await fetcher(url);
      } catch {
        if (first) startProblem = "The address couldn't be reached. Check it's spelt correctly and opens in a browser.";
        continue;
      }
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        if (first) {
          startProblem =
            res.status === 401 || res.status === 403
              ? `The site refused to show the page (HTTP ${res.status}). It may need a login; only public pages can be read.`
              : res.status === 404
                ? "There's no page at that address (HTTP 404). Check the address opens in a browser."
                : `The site answered with an error (HTTP ${res.status}).`;
        }
        continue;
      }
      if (!type.includes("text/html")) {
        if (first) startProblem = `That address isn't a web page${type ? ` (it's ${type.split(";")[0]})` : ""}.`;
        continue;
      }
      const html = (await res.text()).slice(0, MAX_BYTES);
      const page = pageText(html);
      if (page.text.length > 40) pages.set(url, { ...page, hash: createHash("sha256").update(page.text).digest("hex") });
      else if (first && !page.links.length) {
        startProblem = "The page had almost no text. The site may build its pages in the browser with JavaScript, which can't be read this way.";
      }
      for (const href of page.links) {
        let next: URL;
        try {
          next = new URL(href, url);
        } catch {
          continue;
        }
        const key = normalize(next);
        if (!visited.has(key) && inScope(next, root) && visited.size < MAX_PAGES * 4) {
          visited.add(key);
          queue.push(key);
        }
      }
    }

    const now = deps.now();
    if (!pages.size) {
      // Nothing readable: say why, keep any pages read before (the site may be down for a moment),
      // and try again tomorrow.
      await db
        .from("documentation_sources")
        .update({
          status: "failed",
          error: startProblem ?? "No readable pages were found at this address.",
          next_read_at: new Date(now.getTime() + 86_400_000).toISOString(),
        })
        .eq("id", source.id);
      return;
    }

    const { data: existing } = await db.from("document_chunks").select("page_url, page_hash").eq("documentation_source_id", source.id);
    const stored = new Map((existing ?? []).map((c) => [c.page_url!, c.page_hash]));
    // Dropped: pages that are gone or no longer allowed.
    const removed = [...stored.keys()].filter((u) => !pages.has(u));
    if (removed.length) await db.from("document_chunks").delete().eq("documentation_source_id", source.id).in("page_url", removed);

    for (const [url, page] of pages) {
      if (stored.get(url) === page.hash) continue; // unchanged
      const chunks = chunkText(page.text);
      const embeddings = await embedTexts(db, chunks.map((c) => `${page.title}\n${c.content}`), { organizationId: source.organization_id, operation: "embed_documentation" });
      await db.from("document_chunks").delete().eq("documentation_source_id", source.id).eq("page_url", url);
      const { error } = await db.from("document_chunks").insert(
        chunks.map((c, i) => ({
          organization_id: source.organization_id,
          course_id: null,
          session_id: null,
          source_kind: "documentation_page" as const,
          documentation_source_id: source.id,
          page_url: url,
          page_hash: page.hash,
          title: c.heading ? `${page.title} — ${c.heading}` : page.title || url,
          content: c.content,
          chunk_index: c.index,
          embedding: toVector(embeddings[i]),
        })),
      );
      if (error) throw new Error(`store page: ${error.code}`);
    }
    await db
      .from("documentation_sources")
      .update({ status: "ready", page_count: pages.size, error: null, last_read_at: now.toISOString(), next_read_at: new Date(now.getTime() + 7 * 86_400_000).toISOString() })
      .eq("id", source.id);
  } catch (err) {
    await db.from("documentation_sources").update({ status: "failed", error: "The site couldn't be read. Check the address and try again." }).eq("id", source.id);
    console.error(`[read_documentation] ${errorName(err)}`);
  }
}

/** Queues the weekly re-read of every documentation source that has come due. */
export async function scheduleDocumentationReads(deps: JobDeps) {
  const { data } = await deps.admin.from("documentation_sources").select("id, organization_id, next_read_at").lte("next_read_at", deps.now().toISOString());
  for (const s of data ?? []) {
    await enqueue(deps.admin, { kind: "read_documentation", payload: { source_id: s.id }, organizationId: s.organization_id, dedupeKey: `read_documentation:${s.id}:${s.next_read_at}` });
  }
}
