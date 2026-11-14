import { handle } from "@/lib/server/route";
import { recordAction } from "@/lib/server/ops/results";

export const POST = handle("record_action", recordAction, 201);
