import { handle } from "@/lib/server/route";
import { removeDocument } from "@/lib/server/ops/documents";

export const DELETE = handle("remove_document", removeDocument);
