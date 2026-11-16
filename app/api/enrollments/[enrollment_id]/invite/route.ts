import { handle } from "@/lib/server/route";
import { resendInvitation } from "@/lib/server/ops/people";

export const POST = handle("resend_invitation", resendInvitation);
