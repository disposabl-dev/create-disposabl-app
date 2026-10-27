import { cp, rm } from "node:fs/promises";
import { join } from "node:path";

const dir = import.meta.dir;
const outdir = join(dir, "dist");
await rm(outdir, { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: [join(dir, "index.ts")],
  outdir,
  target: "node",
  external: ["commander", "prompts"],
});
if (!result.success) throw new AggregateError(result.logs, "CLI build failed");
await cp(join(dir, "templates"), join(outdir, "templates"), {
  recursive: true,
});
const templatePath = join(outdir, "templates/default/package.json");
const template = await Bun.file(templatePath).json();
const { catalog } = await Bun.file(join(dir, "../package.json")).json();
for (const name of Object.keys(template.devDependencies)) {
  if (template.devDependencies[name] === "catalog:") {
    if (!catalog[name]) throw new Error(`Missing catalog version for ${name}`);
    template.devDependencies[name] = catalog[name];
  }
}
await Bun.write(templatePath, `${JSON.stringify(template, null, 2)}\n`);
for (const file of ["README.md", "LICENSE"]) {
  await cp(join(dir, "..", file), join(dir, file));
}
console.log("Built CLI and bundled starter template.");
