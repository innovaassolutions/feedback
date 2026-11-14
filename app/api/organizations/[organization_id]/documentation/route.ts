import { handle } from "@/lib/server/route";
import { addDocumentationSource } from "@/lib/server/ops/documentation";

export const POST = handle("add_documentation_source", addDocumentationSource, 201);
