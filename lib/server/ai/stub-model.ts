import type {
  EmbeddingModelV4,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { EMBEDDING_DIMENSIONS } from "./provider";

// A deterministic stand-in for a real model. Each agent supplies a "brain" that reads the
// prompt and returns text or tool calls, so tests exercise the real code paths around it.

export type StubReply = { text?: string; toolCalls?: Array<{ name: string; input: unknown }> };
export type StubBrain = (call: StubCall) => StubReply;

export type StubCall = {
  instructions: string;
  /** The JSON in the last <context>…</context> block the agent sent. */
  context: Record<string, unknown>;
  /** Plain text of the last user message. */
  lastUser: string;
  /** Tool results already returned in this call, newest last. */
  toolResults: Array<{ name: string; output: unknown }>;
  toolNames: string[];
  wantsJson: boolean;
  prompt: LanguageModelV4Prompt;
};

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : "")).join("");
  }
  return "";
}

export function readCall(options: LanguageModelV4CallOptions): StubCall {
  const prompt = options.prompt;
  const instructions = prompt.filter((m) => m.role === "system").map((m) => textOf(m.content)).join("\n");
  const users = prompt.filter((m) => m.role === "user");
  const lastUser = users.length ? textOf(users[users.length - 1].content) : "";
  const all = prompt.map((m) => textOf(m.content)).join("\n");
  const matches = [...all.matchAll(/<context>([\s\S]*?)<\/context>/g)];
  let context: Record<string, unknown> = {};
  if (matches.length) {
    try {
      context = JSON.parse(matches[matches.length - 1][1]);
    } catch {
      context = {};
    }
  }
  const toolResults: StubCall["toolResults"] = [];
  for (const m of prompt) {
    if (m.role !== "tool") continue;
    for (const part of m.content) {
      if (part.type === "tool-result") {
        const out = part.output as { type: string; value?: unknown };
        toolResults.push({ name: part.toolName, output: out?.value ?? out });
      }
    }
  }
  return {
    instructions,
    context,
    lastUser,
    toolResults,
    toolNames: (options.tools ?? []).map((t) => t.name),
    wantsJson: options.responseFormat?.type === "json",
    prompt,
  };
}

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

let callCounter = 0;

export function stubLanguageModel(agent: string, brain: StubBrain): LanguageModelV4 {
  const generate = async (options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> => {
    const call = readCall(options);
    const reply = brain(call);
    const content: LanguageModelV4Content[] = [];
    if (reply.text) content.push({ type: "text", text: reply.text });
    for (const tc of reply.toolCalls ?? []) {
      content.push({ type: "tool-call", toolCallId: `stub-${++callCounter}`, toolName: tc.name, input: JSON.stringify(tc.input) });
    }
    const inputTokens = Math.ceil(JSON.stringify(options.prompt).length / 4);
    const outputTokens = Math.ceil((reply.text ?? JSON.stringify(reply.toolCalls ?? "")).length / 4);
    return {
      content,
      finishReason: { unified: reply.toolCalls?.length ? "tool-calls" : "stop", raw: undefined },
      usage: usage(inputTokens, outputTokens),
      warnings: [],
    };
  };
  return {
    specificationVersion: "v4",
    provider: "stub",
    modelId: `stub/${agent}`,
    supportedUrls: {},
    doGenerate: generate,
    async doStream(options) {
      const result = await generate(options);
      const parts: LanguageModelV4StreamPart[] = [{ type: "stream-start", warnings: [] }];
      for (const c of result.content) {
        if (c.type === "text") {
          parts.push({ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: c.text }, { type: "text-end", id: "t" });
        } else if (c.type === "tool-call") {
          parts.push(c);
        }
      }
      parts.push({ type: "finish", finishReason: result.finishReason, usage: result.usage });
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const p of parts) controller.enqueue(p);
            controller.close();
          },
        }),
      };
    },
  };
}

const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from has have how i if in into is it its my of on or so that the their there this to was we what when where which who why will with you your".split(" "),
);

export function stubTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
}

function hash(s: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A bag-of-words vector: texts that share words point the same way. */
export function stubEmbed(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const token of stubTokens(text)) {
    for (let k = 0; k < 2; k++) {
      const h = hash(token, k);
      v[h % EMBEDDING_DIMENSIONS] += h & 1 ? 1 : -1;
    }
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norm === 0) {
    v[0] = 1;
    return v;
  }
  return v.map((x) => x / norm);
}

export function stubEmbeddingModel(): EmbeddingModelV4 {
  return {
    specificationVersion: "v4",
    provider: "stub",
    modelId: "stub/embedding",
    maxEmbeddingsPerCall: 256,
    supportsParallelCalls: true,
    async doEmbed({ values }) {
      return { embeddings: values.map(stubEmbed), usage: { tokens: Math.ceil(values.join(" ").length / 4) }, warnings: [] };
    },
  };
}
