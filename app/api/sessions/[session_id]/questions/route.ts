import { handle } from "@/lib/server/route";
import { askQuestion, listQuestions } from "@/lib/server/ops/questions";

export const GET = handle("list_questions", listQuestions);
export const POST = handle("ask_question", askQuestion, 201);
