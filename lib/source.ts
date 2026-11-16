import { defineDocs } from "fumadocs-mdx/macro";
import { loader } from "fumadocs-core/source";

// The user guide at /docs, written in MDX under content/docs.
const docs = defineDocs({
  dir: "content/docs",
});

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
