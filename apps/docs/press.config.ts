import { flexsearchPlugin } from "fumapress/plugins/flexsearch";
import { defineConfig } from "fumapress";
import { fumadocsMdx } from "fumapress/adapters/mdx";
import { metaSchema, pageSchema } from "fumapress/adapters/mdx/schema";
import { defineDocs } from "fumadocs-mdx/macro";

import config from "../../disposabl.json";

const docs = defineDocs({
  dir: "content",
  docs: { async: true, schema: pageSchema },
  meta: { schema: metaSchema },
});

const source = docs.toFumadocsSource();
const selected: readonly string[] = config.platforms;
source.files = source.files.filter((file) => {
  if (file.path === "mobile.mdx")
    return selected.some((id) => ["android", "ios"].includes(id));
  if (file.path === "desktop.mdx")
    return selected.some((id) => ["macos", "windows", "linux"].includes(id));
  return true;
});

export default defineConfig({
  mode: "static",
  preset: false,
  content: source,
  site: { name: "Documentation" },
})
  .adapters(fumadocsMdx())
  .plugins(flexsearchPlugin());
