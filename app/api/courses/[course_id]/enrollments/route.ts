import { handle } from "@/lib/server/route";
import { inviteLearners } from "@/lib/server/ops/roster";

export const POST = handle("invite_learners", inviteLearners);
