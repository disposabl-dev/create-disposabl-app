import { cp, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import manifest from "./package.json";

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
const cli = await Bun.build({
  entrypoints: [join(root, "packages/cli/index.ts")],
  outdir,
  naming: "disposabl.js",
  target: "node",
  external: ["commander", "proper-lockfile", "@modelcontextprotocol/sdk"],
  plugins: [
    {
      name: "bundled-cli-version",
      setup(build) {
        build.onLoad(
          { filter: /packages\/cli\/package\.json$/ },
          async ({ path }) => ({
            loader: "json",
            contents: JSON.stringify({
              ...(await Bun.file(path).json()),
              version: manifest.version,
            }),
          }),
        );
      },
    },
  ],
});
if (!cli.success)
  throw new AggregateError(cli.logs, "Disposabl CLI build failed");
await cp(join(root, "LICENSE"), join(dir, "LICENSE"));

// Bundle the complete starter; the CLI keeps only the selected app folders.
const templateDir = await mkdtemp(join(tmpdir(), "disposabl-starter-"));
try {
  const copySource = (source: string, destination: string) =>
    cp(source, destination, {
      recursive: true,
      filter: (path) =>
        path !== join(root, "apps/web/src/components/landing") &&
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
          "tests",
        ].includes(basename(path)) &&
        path !== join(root, "apps/mobile/android") &&
        path !== join(root, "apps/mobile/ios") &&
        path !== join(root, "apps/desktop/out") &&
        !/\.test\.[^.]+$/.test(basename(path)) &&
        (!basename(path).endsWith(".tgz") ||
          path.startsWith(join(root, "vendor") + sep)) &&
        !basename(path).endsWith(".tsbuildinfo") &&
        !/^\.env(?:\.|$)/.test(basename(path)),
    });
  for (const item of await readdir(root, { withFileTypes: true })) {
    const entry = item.name;
    if (
      item.isDirectory()
        ? ![
            ".github",
            "apps",
            "packages",
            "patches",
            "starter",
            "vendor",
          ].includes(entry)
        : ![
            "LICENSE",
            "AGENTS.md",
            "dev.ts",
            "reset.ts",
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
    await copySource(join(root, entry), join(templateDir, entry));
  }
  // Product-to-starter transformations belong to the app's reset script.
  await Bun.write(
    join(templateDir, ".disposabl-staging.json"),
    JSON.stringify({ source: resolve(root), directory: resolve(templateDir) }),
  );
  const reset = Bun.spawn([process.execPath, "reset.ts"], {
    cwd: templateDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await reset.exited) !== 0) throw new Error("Starter reset failed.");
  await cp(
    join(dir, "starter/web/index.tsx"),
    join(templateDir, "apps/web/src/router/index.tsx"),
  );
  for (const file of ["reset.ts", "starter", ".disposabl-staging.json"])
    await rm(join(templateDir, file), { recursive: true, force: true });
  // npm omits .gitignore files from packed templates.
  for (const path of await readdir(templateDir, { recursive: true })) {
    if (basename(path) === ".gitignore") {
      await rename(
        join(templateDir, path),
        join(templateDir, path.replace(/\.gitignore$/, "gitignore")),
      );
    }
  }
  await cp(templateDir, join(outdir, "templates/default"), { recursive: true });
  console.log("Built CLI and bundled app source.");
} finally {
  await rm(templateDir, { recursive: true, force: true });
}
