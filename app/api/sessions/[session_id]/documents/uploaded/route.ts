import { handle } from "@/lib/server/route";
import { registerDocument } from "@/lib/server/ops/documents";

export const POST = handle("register_document", registerDocument, 201);
