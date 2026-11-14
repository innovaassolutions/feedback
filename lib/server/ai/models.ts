import { gateway } from "@ai-sdk/gateway";
import type { EmbeddingModelV4, LanguageModelV4 } from "@ai-sdk/provider";
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
  return gateway.languageModel(modelIdFor(agent));
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
