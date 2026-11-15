import { gateway } from "@ai-sdk/gateway";
import { wrapLanguageModel } from "ai";
import type { EmbeddingModelV4, LanguageModelV4, LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { aiProvider, embeddingModelId, modelIdFor, type AgentName } from "./provider";
import { stubEmbeddingModel, stubLanguageModel, type StubBrain } from "./stub-model";
import { STUB_BRAINS } from "./stub-brains";

const overrides = new Map<AgentName, StubBrain>();

/** Lets a test make an agent's stub behave a particular way. Pass null to restore it. */
export function overrideStubBrain(agent: AgentName, brain: StubBrain | null) {
  if (brain) overrides.set(agent, brain);
  else overrides.delete(agent);
}

export function languageModel(agent: AgentName): LanguageModelV4 {
  if (aiProvider() === "stub") {
    const brain = overrides.get(agent) ?? STUB_BRAINS[agent];
    if (!brain) throw new Error(`No stub registered for ${agent}`);
    return stubLanguageModel(agent, brain);
  }
  return withReasoning(gateway.languageModel(modelIdFor(agent)));
}

type Reasoning = NonNullable<LanguageModelV4CallOptions["reasoning"]>;
const REASONING_LEVELS: Reasoning[] = ["provider-default", "none", "minimal", "low", "medium", "high", "xhigh", "max"];

/**
 * Every call's output budget is sized for the answer alone. A model that reasons first can spend
 * the budget before it answers (the Interviewer's 600 tokens ran out mid-turn), and reasoning
 * slows a live interview. So reasoning is kept to the minimum unless AI_REASONING asks for more.
 * ("none" isn't available on Claude Sonnet 5.5: the gateway maps it to the lowest level with a warning
 * on every call, and "minimal" reaches the same level without one.)
 */
export function reasoningLevel(): Reasoning {
  const fromEnv = process.env.AI_REASONING as Reasoning | undefined;
  return fromEnv && REASONING_LEVELS.includes(fromEnv) ? fromEnv : "minimal";
}

function withReasoning(model: LanguageModelV4): LanguageModelV4 {
  const reasoning = reasoningLevel();
  return wrapLanguageModel({
    model,
    middleware: { specificationVersion: "v4", transformParams: async ({ params }) => ({ ...params, reasoning: params.reasoning ?? reasoning }) },
  });
}

export function embeddingModel(): EmbeddingModelV4 {
  if (aiProvider() === "stub") return stubEmbeddingModel();
  return gateway.embeddingModel(embeddingModelId());
}

/** How similar a chunk must be to count as relevant. Stub vectors are sparser than real ones. */
export function relevanceThreshold(): number {
  const fromEnv = Number(process.env.LIBRARIAN_RELEVANCE_THRESHOLD);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  // Stub vectors are bags of words: one shared word in four scores about 0.2, which isn't relevance.
  return aiProvider() === "stub" ? 0.3 : 0.35;
}
