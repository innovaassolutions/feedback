import { handle } from "@/lib/server/route";
import { removeStaff } from "@/lib/server/ops/people";

export const DELETE = handle("remove_staff", removeStaff);
