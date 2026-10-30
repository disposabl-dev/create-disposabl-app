import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, join } from "node:path";

const dir = import.meta.dir;
const root = join(dir, "../..");
const outdir = join(dir, "dist");
await rm(outdir, { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: [join(dir, "index.ts")],
  outdir,
  target: "node",
  external: ["commander", "@clack/core", "@clack/prompts", "picocolors"],
});
if (!result.success) throw new AggregateError(result.logs, "CLI build failed");
await cp(join(root, "LICENSE"), join(dir, "LICENSE"));

// Bundle the complete starter; the CLI keeps only the selected app folders.
{
  const templateDir = join(outdir, "templates/default");
  await mkdir(templateDir, { recursive: true });
  const copySource = (source: string, destination: string) =>
    cp(source, destination, {
      recursive: true,
      filter: (path) =>
        ![
          ".git",
          ".github",
          "node_modules",
          "dist",
          ".turbo",
          ".expo",
          ".vite",
          ".DS_Store",
        ].includes(basename(path)) &&
        path !== dir &&
        !basename(path).endsWith(".tgz") &&
        (basename(path) === ".env.example" ||
          !/^\.env(?:\.|$)/.test(basename(path))),
    });
  for (const item of await readdir(root, { withFileTypes: true })) {
    const entry = item.name;
    if (item.isDirectory() && !["apps", "packages", "patches"].includes(entry))
      continue;
    if (entry === "packages") {
      for (const pkg of await readdir(join(root, entry))) {
        if (pkg !== "create-disposabl-app") {
          await copySource(
            join(root, entry, pkg),
            join(templateDir, entry, pkg),
          );
        }
      }
    } else {
      await copySource(join(root, entry), join(templateDir, entry));
    }
  }
  const manifestPath = join(templateDir, "package.json");
  if (!(await Bun.file(manifestPath).exists())) {
    await Bun.write(
      manifestPath,
      JSON.stringify(
        {
          name: "disposabl-app",
          private: true,
          type: "module",
          packageManager: "bun@1.4.4",
          workspaces: ["apps/*", "packages/*"],
          scripts: {
            dev: "bun run --parallel --if-present --filter './apps/*' dev",
          },
        },
        null,
        2,
      ) + "\n",
    );
  }
  // npm omits .gitignore files from packed templates.
  if (await Bun.file(join(templateDir, ".gitignore")).exists()) {
    await rename(
      join(templateDir, ".gitignore"),
      join(templateDir, "gitignore"),
    );
  } else {
    await Bun.write(
      join(templateDir, "gitignore"),
      "node_modules/\n.env\n.env.*\n!.env.example\n**/dist/\n.turbo/\n",
    );
  }
  console.log("Built CLI and bundled app source.");
}
