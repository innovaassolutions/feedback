import { z } from "zod";
import { json, requestCtx } from "@/lib/server/route";
import { deleteQuestion } from "@/lib/server/ops/questions";
import { HttpError } from "@/lib/server/http";

/** An instructor deletes a question, with its answers. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ question_id: string }> }) {
  const { question_id } = await params;
  if (!z.uuid().safeParse(question_id).success) return json(404, { error: "Not found" });
  try {
    return json(200, await deleteQuestion(await requestCtx(), question_id));
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    return json(500, { error: "Something went wrong" });
  }
}
