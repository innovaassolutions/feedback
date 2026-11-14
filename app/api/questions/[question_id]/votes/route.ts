import { handle } from "@/lib/server/route";
import { voteQuestion } from "@/lib/server/ops/questions";

export const POST = handle("vote_question", voteQuestion, 201);
