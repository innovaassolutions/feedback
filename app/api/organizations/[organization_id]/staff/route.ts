import { handle } from "@/lib/server/route";
import { addStaff } from "@/lib/server/ops/people";

export const POST = handle("add_staff", addStaff, 201);
