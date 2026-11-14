import { z } from "zod";
import { json, requestCtx } from "@/lib/server/route";
import { deleteAnswer } from "@/lib/server/ops/questions";
import { HttpError } from "@/lib/server/http";

/** An instructor deletes an answer. It stops being a source. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ answer_id: string }> }) {
  const { answer_id } = await params;
  if (!z.uuid().safeParse(answer_id).success) return json(404, { error: "Not found" });
  try {
    return json(200, await deleteAnswer(await requestCtx(), answer_id));
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    return json(500, { error: "Something went wrong" });
  }
}
