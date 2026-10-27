import { cp, rm } from "node:fs/promises";
import { join } from "node:path";

const dir = import.meta.dir;
const outdir = join(dir, "dist");
await rm(outdir, { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: [join(dir, "index.ts")],
  outdir,
  target: "node",
});
if (!result.success) throw new AggregateError(result.logs, "CLI build failed");
await cp(join(dir, "templates"), join(outdir, "templates"), {
  recursive: true,
});
console.log("Built CLI and bundled starter template.");
