import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

// Search for the user guide at /docs. It reads only the guide's own pages.
export const { GET } = createFromSource(source, { language: "english" });
