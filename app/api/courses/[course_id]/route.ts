import { handle } from "@/lib/server/route";
import { deleteCourse, updateCourse } from "@/lib/server/ops/editing";

export const POST = handle("update_course", updateCourse);
export const DELETE = handle("delete_course", deleteCourse);
