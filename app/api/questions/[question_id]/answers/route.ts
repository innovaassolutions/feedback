import { handle } from "@/lib/server/route";
import { answerQuestionOp } from "@/lib/server/ops/questions";

export const POST = handle("answer_question", answerQuestionOp);
