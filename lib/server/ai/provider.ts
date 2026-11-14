// Which model provider runs: the Vercel AI Gateway, or the built-in stub used by tests and by
// development without a key. Tests never call a real model.

export type AgentName = "interviewer" | "analyst" | "librarian" | "brand_designer" | "judge";

export function aiProvider(): "gateway" | "stub" {
  const explicit = process.env.AI_PROVIDER;
  if (explicit === "stub" || explicit === "gateway") return explicit;
  const hasKey = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
  if (hasKey) return "gateway";
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV === "production") {
    throw new Error("No model key: set AI_GATEWAY_API_KEY, or AI_PROVIDER=stub to run without a model");
  }
  return "stub";
}

const AGENT_ENV: Record<AgentName, string> = {
  interviewer: "AI_MODEL_INTERVIEWER",
  analyst: "AI_MODEL_ANALYST",
  librarian: "AI_MODEL_LIBRARIAN",
  brand_designer: "AI_MODEL_BRAND_DESIGNER",
  judge: "AI_MODEL_JUDGE",
};

/** The model id an agent uses. It comes from the environment, so it can change without a code change. */
export function modelIdFor(agent: AgentName): string {
  if (aiProvider() === "stub") return `stub/${agent}`;
  return process.env[AGENT_ENV[agent]] || process.env.AI_MODEL || "anthropic/claude-sonnet-5.5";
}

export function embeddingModelId(): string {
  if (aiProvider() === "stub") return "stub/embedding";
  return process.env.AI_EMBEDDING_MODEL || "openai/text-embedding-3-small";
}

export const EMBEDDING_DIMENSIONS = 1536;
