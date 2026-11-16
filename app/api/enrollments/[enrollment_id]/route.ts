import { handle } from "@/lib/server/route";
import { removeEnrollment, updateEnrollment } from "@/lib/server/ops/editing";

export const POST = handle("update_enrollment", updateEnrollment);
export const DELETE = handle("remove_enrollment", removeEnrollment);
