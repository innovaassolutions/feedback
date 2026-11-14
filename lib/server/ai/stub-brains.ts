import { librarianStub } from "@/agents/librarian/stub";
import { interviewerStub } from "@/agents/interviewer/stub";
import { analystStub } from "@/agents/analyst/stub";
import { judgeStub } from "@/lib/server/quality/rubric";
import { brandDesignerStub } from "@/agents/brand-designer/stub";
import type { AgentName } from "./provider";
import type { StubBrain } from "./stub-model";

/** How each agent's stub answers. Stubs never import the model layer, so there is no cycle. */
export const STUB_BRAINS: Partial<Record<AgentName, StubBrain>> = {
  librarian: librarianStub,
  interviewer: interviewerStub,
  analyst: analystStub,
  brand_designer: brandDesignerStub,
  judge: (call) => ({ text: JSON.stringify(judgeStub(call.context)) }),
};
