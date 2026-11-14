import { handle } from "@/lib/server/route";
import { getQuality } from "@/lib/server/ops/quality";

export const GET = handle("get_quality", (ctx) => getQuality(ctx));
