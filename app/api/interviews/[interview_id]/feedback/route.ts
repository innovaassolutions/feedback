import { z } from "zod";
import { json, requestCtx } from "@/lib/server/route";
import { rateInterview } from "@/lib/server/ops/interviews";
import { HttpError } from "@/lib/server/http";

const body = z.object({ rating: z.enum(["helpful", "okay", "not_helpful"]) });

/** The learner's one-tap rating of the interview, after submitting. */
export async function POST(req: Request, { params }: { params: Promise<{ interview_id: string }> }) {
  const { interview_id } = await params;
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || !z.uuid().safeParse(interview_id).success) return json(422, { error: "Choose one of the options" });
  try {
    return json(200, await rateInterview(await requestCtx(), interview_id, parsed.data.rating));
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    return json(500, { error: "Something went wrong" });
  }
}
