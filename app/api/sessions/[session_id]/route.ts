import { handle } from "@/lib/server/route";
import { getSession } from "@/lib/server/ops/sessions";
import { deleteSession, updateSession } from "@/lib/server/ops/editing";

export const GET = handle("get_session", getSession);
export const POST = handle("update_session", updateSession);
export const DELETE = handle("delete_session", deleteSession);
