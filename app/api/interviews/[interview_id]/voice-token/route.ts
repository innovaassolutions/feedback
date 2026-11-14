import { handle } from "@/lib/server/route";
import { getVoiceToken } from "@/lib/server/ops/interviews";

export const POST = handle("get_voice_token", (ctx, input) => getVoiceToken(ctx, input));
