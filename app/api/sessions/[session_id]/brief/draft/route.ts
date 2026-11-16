import { handle } from "@/lib/server/route";
import { requestBriefDraft } from "@/lib/server/ops/sessions";

export const POST = handle("draft_brief", requestBriefDraft, 202);
