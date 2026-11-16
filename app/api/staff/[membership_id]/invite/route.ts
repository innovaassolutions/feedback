import { handle } from "@/lib/server/route";
import { resendStaffInvitation } from "@/lib/server/ops/people";

export const POST = handle("resend_staff_invitation", resendStaffInvitation);
