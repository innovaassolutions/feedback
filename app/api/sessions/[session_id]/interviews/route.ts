import { handle } from "@/lib/server/route";
import { startInterview } from "@/lib/server/ops/interviews";
import { listInterviews } from "@/lib/server/ops/results";

export const POST = handle("start_interview", startInterview, 201);
export const GET = handle("list_interviews", (ctx, input) => listInterviews(ctx, input));
