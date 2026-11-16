import { handle } from "@/lib/server/route";
import { addPlatformAdmin } from "@/lib/server/ops/people";

export const POST = handle("add_platform_admin", addPlatformAdmin, 201);
