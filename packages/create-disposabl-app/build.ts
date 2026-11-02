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
          "node_modules",
          "dist",
          ".turbo",
          ".expo",
          ".vite",
          ".output",
          ".tanstack",
          ".nitro",
          ".vinxi",
          ".convex",
          ".DS_Store",
        ].includes(basename(path)) &&
        path !== dir &&
        path !== join(root, "apps/desktop") &&
        path !== join(root, "apps/mobile/android") &&
        path !== join(root, "apps/mobile/ios") &&
        path !== join(root, "apps/desktop/out") &&
        !basename(path).endsWith(".tgz") &&
        !basename(path).endsWith(".tsbuildinfo") &&
        (basename(path) === ".env.example" ||
          !/^\.env(?:\.|$)/.test(basename(path))),
    });
  for (const item of await readdir(root, { withFileTypes: true })) {
    const entry = item.name;
    if (
      item.isDirectory()
        ? ![".github", "apps", "packages", "patches"].includes(entry)
        : ![
            "LICENSE",
            "package.json",
            "bun.lock",
            "bunfig.toml",
            "disposabl.json",
            "turbo.json",
            "tsconfig.json",
            ".gitignore",
          ].includes(entry)
    )
      continue;
    if (entry === ".github") {
      await cp(join(root, entry), join(templateDir, entry), {
        recursive: true,
        filter: (path) => path !== join(root, ".github/workflows/publish.yml"),
      });
    } else if (entry === "packages") {
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
