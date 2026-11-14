import { handle } from "@/lib/server/route";
import { setSessionState } from "@/lib/server/ops/sessions";

export const POST = handle("set_session_state", setSessionState);
