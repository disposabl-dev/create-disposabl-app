import { flexsearchPlugin } from "fumapress/plugins/flexsearch";
import { defineConfig } from "fumapress";
import { fumadocsMdx } from "fumapress/adapters/mdx";
import { metaSchema, pageSchema } from "fumapress/adapters/mdx/schema";
import { defineDocs } from "fumadocs-mdx/macro";

const docs = defineDocs({
  dir: "content",
  docs: { async: true, schema: pageSchema },
  meta: { schema: metaSchema },
});

export default defineConfig({
  mode: "static",
  preset: false,
  content: docs.toFumadocsSource(),
  site: { name: "Documentation" },
})
  .adapters(fumadocsMdx())
  .plugins(flexsearchPlugin());
