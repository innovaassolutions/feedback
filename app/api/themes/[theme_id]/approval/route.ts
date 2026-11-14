import { handle } from "@/lib/server/route";
import { approveTheme } from "@/lib/server/ops/themes";

export const POST = handle("approve_theme", approveTheme);
