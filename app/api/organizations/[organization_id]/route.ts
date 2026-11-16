import { handle } from "@/lib/server/route";
import { updateOrganization } from "@/lib/server/ops/editing";

export const POST = handle("update_organization", updateOrganization);
