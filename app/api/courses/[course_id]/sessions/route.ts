import { handle } from "@/lib/server/route";
import { createSession, listSessions } from "@/lib/server/ops/sessions";

export const GET = handle("list_sessions", listSessions);
export const POST = handle("create_session", createSession, 201);
