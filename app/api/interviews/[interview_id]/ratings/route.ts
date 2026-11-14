import { handle } from "@/lib/server/route";
import { saveRating } from "@/lib/server/ops/interviews";

export const maxDuration = 60;
export const POST = handle("save_rating", saveRating);
