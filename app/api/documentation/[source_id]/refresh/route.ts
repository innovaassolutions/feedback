import { handle } from "@/lib/server/route";
import { refreshDocumentationSource } from "@/lib/server/ops/editing";

export const POST = handle("refresh_documentation_source", refreshDocumentationSource);
