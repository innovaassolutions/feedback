// Documentation sites built as JavaScript apps send the same empty page for every address and draw
// the text in the browser, so reading their pages finds nothing. Some of them (Vite apps that load
// their Markdown with import.meta.glob, such as studio-docs.streamspace.ai) carry every page inside
// their script file: a map from each Markdown file's path to its text. This reads those pages out
// of the script as text. Nothing in the script is run.

export type EmbeddedPage = { url: string; title: string; text: string };

/** The same-site scripts a page loads, module scripts first. */
export function scriptUrls(html: string, pageUrl: string): string[] {
  const origin = new URL(pageUrl).origin;
  const found: Array<{ url: string; module: boolean }> = [];
  for (const m of html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>/gi)) {
    let url: URL;
    try {
      url = new URL(m[2], pageUrl);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    found.push({ url: url.toString(), module: /type=["']module["']/i.test(`${m[1]} ${m[3]}`) });
  }
  return [...found.sort((a, b) => Number(b.module) - Number(a.module)).map((f) => f.url)].filter((u, i, all) => all.indexOf(u) === i).slice(0, 5);
}

/** Reads the string literal that starts at `start` (a backtick, double or single quote). */
function readLiteral(source: string, start: number): string | null {
  const quote = source[start];
  if (quote !== "`" && quote !== '"' && quote !== "'") return null;
  let out = "";
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i];
    if (c === "\\") {
      const next = source[i + 1];
      const simple: Record<string, string> = { n: "\n", t: "\t", r: "", "`": "`", $: "$", "\\": "\\", "'": "'", '"': '"', "0": "" };
      if (next in simple) {
        out += simple[next];
        i++;
        continue;
      }
      if (next === "u") {
        const braced = /^\{([0-9a-fA-F]+)\}/.exec(source.slice(i + 2, i + 10));
        const plain = /^[0-9a-fA-F]{4}/.exec(source.slice(i + 2, i + 6));
        if (braced) {
          out += String.fromCodePoint(parseInt(braced[1], 16));
          i += 2 + braced[0].length - 1;
          continue;
        }
        if (plain) {
          out += String.fromCharCode(parseInt(plain[0], 16));
          i += 5;
          continue;
        }
      }
      if (next === "\n") {
        i++;
        continue;
      }
      out += next ?? "";
      i++;
      continue;
    }
    if (c === quote) return out;
    // A template literal with a real ${…} isn't plain text.
    if (quote === "`" && c === "$" && source[i + 1] === "{") return null;
    out += c;
  }
  return null;
}

/** Every Markdown file the script carries, by its path: "/content/docs/x.md" → its text. */
export function embeddedMarkdown(script: string): Map<string, string> {
  const ids = new Map<string, string>();
  for (const m of script.matchAll(/"(\/[^"\s]{1,300}\.mdx?)"\s*:\s*([A-Za-z_$][\w$]*)/g)) ids.set(m[1], m[2]);
  const files = new Map<string, string>();
  const definitions = new Map<string, number>();
  for (const id of new Set(ids.values())) {
    const re = new RegExp(`(?:^|[^\\w$.])${id.replace(/\$/g, "\\$")}\\s*=\\s*`, "g");
    const m = re.exec(script);
    if (m) definitions.set(id, m.index + m[0].length);
  }
  for (const [path, id] of ids) {
    const at = definitions.get(id);
    if (at === undefined) continue;
    const text = readLiteral(script, at);
    if (text !== null) files.set(path, text);
  }
  return files;
}

/** Constants such as BRAND_NAME="Streamspace" that fill {{BRAND_NAME}} in the pages. */
function templateValues(script: string, files: Map<string, string>): Record<string, string> {
  const used = new Set<string>();
  for (const text of files.values()) for (const m of text.matchAll(/\{\{([A-Z][A-Z0-9_]{2,})\}\}/g)) used.add(m[1]);
  const values: Record<string, string> = {};
  for (const name of used) {
    const m = new RegExp(`(?:^|[^\\w$.])${name}\\s*=\\s*"([^"\\\\]{1,80})"`).exec(script);
    if (m) values[name] = m[1];
  }
  return values;
}

const INCLUDE = /(--8<--|\[\[%\s*include)\s+"([^"]+)"(?:\s*%\]\])?/g;

function resolveIncludes(text: string, files: Map<string, string>, depth = 0): string {
  if (depth > 5) return text;
  return text.replace(INCLUDE, (_m, _kind, ref: string) => {
    const clean = ref.replace(/^\/+/, "");
    const candidates = [ref, `/${clean}`, `/content/${clean}`, `/content/docs/${clean}`];
    const found = candidates.map((c) => files.get(c)).find((t) => t !== undefined);
    return found === undefined ? "" : resolveIncludes(found, files, depth + 1);
  });
}

/** The address a Markdown file is shown at: "/content/docs/a/b.md" → "/docs/a/b". */
function routeOf(path: string): string {
  const route = path.replace(/^\/content(?=\/)/, "").replace(/\.mdx?$/, "").replace(/\/index$/, "");
  return route || "/";
}

/** The documentation pages in a script, as text with their addresses and titles. */
export function pagesFromScript(script: string, inScope: (url: URL) => boolean, origin: string): EmbeddedPage[] {
  const files = embeddedMarkdown(script);
  if (!files.size) return [];
  const values = templateValues(script, files);
  const pages: EmbeddedPage[] = [];
  for (const [path, raw] of files) {
    // Fragments and macros (any part starting with "_") are pulled into pages, not pages themselves.
    if (path.split("/").some((part) => part.startsWith("_"))) continue;
    let text = resolveIncludes(raw, files);
    for (const [name, value] of Object.entries(values)) text = text.split(`{{${name}}}`).join(value);
    if (values.BRAND_NAME) text = text.split("::brand::").join(values.BRAND_NAME);
    const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    const title = (front ? /^title:\s*["']?(.+?)["']?\s*$/m.exec(front[1])?.[1] : undefined) ?? /^#\s+(.+)$/m.exec(text)?.[1] ?? "";
    text = (front ? text.slice(front[0].length) : text)
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\[\[%[\s\S]*?%\]\]/g, "")
      .replace(/\{%[\s\S]*?%\}/g, "")
      .replace(/<\/?[A-Za-z][^>]*>/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    let url: URL;
    try {
      url = new URL(routeOf(path), origin);
    } catch {
      continue;
    }
    const heading = title.trim();
    const titled = heading && !text.startsWith(`# ${heading}`) ? `# ${heading}\n\n${text}` : text;
    if (text.length > 40 && inScope(url)) pages.push({ url: url.toString(), title: heading, text: titled });
  }
  return pages;
}
