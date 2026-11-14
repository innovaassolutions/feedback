import { handle } from "@/lib/server/route";
import { sendTurn } from "@/lib/server/ops/interviews";

export const maxDuration = 60;
export const POST = handle("send_turn", sendTurn);
