import { handle } from "@/lib/server/route";
import { removeDocumentationSource } from "@/lib/server/ops/editing";

export const DELETE = handle("remove_documentation_source", removeDocumentationSource);
