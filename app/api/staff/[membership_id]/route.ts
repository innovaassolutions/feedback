import { handle } from "@/lib/server/route";
import { removeStaff } from "@/lib/server/ops/people";
import { updateStaff } from "@/lib/server/ops/editing";

export const POST = handle("update_staff", updateStaff);
export const DELETE = handle("remove_staff", removeStaff);
