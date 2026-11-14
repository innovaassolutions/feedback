import { handle } from "@/lib/server/route";
import { getSession } from "@/lib/server/ops/sessions";

export const GET = handle("get_session", getSession);
