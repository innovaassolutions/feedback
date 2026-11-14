import { handle } from "@/lib/server/route";
import { approveBrief } from "@/lib/server/ops/sessions";

export const POST = handle("approve_brief", approveBrief);
