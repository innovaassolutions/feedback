import { handle } from "@/lib/server/route";
import { submitInterview } from "@/lib/server/ops/interviews";

export const POST = handle("submit_interview", submitInterview);
