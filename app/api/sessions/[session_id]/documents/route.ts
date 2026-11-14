import { handle } from "@/lib/server/route";
import { addDocument } from "@/lib/server/ops/documents";

export const maxDuration = 60;
export const POST = handle("add_document", addDocument, 201);
