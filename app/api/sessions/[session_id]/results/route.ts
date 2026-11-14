import { handle } from "@/lib/server/route";
import { getSessionResults } from "@/lib/server/ops/results";

export const GET = handle("get_session_results", getSessionResults);
