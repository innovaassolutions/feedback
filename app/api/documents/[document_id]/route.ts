import { handle } from "@/lib/server/route";
import { removeDocument } from "@/lib/server/ops/documents";
import { updateDocument } from "@/lib/server/ops/editing";

export const POST = handle("update_document", updateDocument);
export const DELETE = handle("remove_document", removeDocument);
