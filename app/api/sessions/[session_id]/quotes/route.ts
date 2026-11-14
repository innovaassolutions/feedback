import { z } from "zod";
import { json, requestCtx } from "@/lib/server/route";
import { getSessionQuotes } from "@/lib/server/ops/results";
import { HttpError } from "@/lib/server/http";

/** Quotes for a session's instructors. Sponsors and learners get 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ session_id: string }> }) {
  const { session_id } = await params;
  if (!z.uuid().safeParse(session_id).success) return json(404, { error: "Not found" });
  try {
    return json(200, await getSessionQuotes(await requestCtx(), session_id));
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    return json(500, { error: "Something went wrong" });
  }
}
