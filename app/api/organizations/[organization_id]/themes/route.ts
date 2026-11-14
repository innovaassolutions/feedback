import { handle } from "@/lib/server/route";
import { proposeTheme } from "@/lib/server/ops/themes";

export const maxDuration = 60;
export const POST = handle("propose_theme", proposeTheme, 201);
