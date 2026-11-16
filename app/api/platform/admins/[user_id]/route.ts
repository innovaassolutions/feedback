import { handle } from "@/lib/server/route";
import { removePlatformAdmin } from "@/lib/server/ops/people";

export const DELETE = handle("remove_platform_admin", removePlatformAdmin);
