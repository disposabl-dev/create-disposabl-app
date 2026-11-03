import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
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
{
  const templateDir = join(outdir, "templates/default");
  await mkdir(templateDir, { recursive: true });
  // Only reusable backend modules belong in a fresh app. New product modules
  // must not leak into the starter when Disposabl adds a feature.
  const backend = join(root, "packages/backend");
  const starterModules = new Set([
    "_generated",
    "auth.ts",
    "auth.config.ts",
    "mcp.ts",
    "tsconfig.json",
    "users",
  ]);
  const copySource = (source: string, destination: string) =>
    cp(source, destination, {
      recursive: true,
      filter: (path) =>
        (!path.startsWith(join(backend, "convex") + sep) ||
          starterModules.has(
            relative(join(backend, "convex"), path).split(sep)[0]!,
          )) &&
        path !== join(backend, "generated") &&
        path !== join(root, "packages/sdk/src/generated") &&
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
        path !== dir &&
        path !== join(root, "apps/mobile/android") &&
        path !== join(root, "apps/mobile/ios") &&
        path !== join(root, "apps/desktop/out") &&
        !/\.test\.[^.]+$/.test(basename(path)) &&
        !basename(path).endsWith(".tgz") &&
        !basename(path).endsWith(".tsbuildinfo") &&
        !/^\.env(?:\.|$)/.test(basename(path)),
    });
  for (const item of await readdir(root, { withFileTypes: true })) {
    const entry = item.name;
    if (
      item.isDirectory()
        ? ![".github", "apps", "packages", "patches"].includes(entry)
        : ![
            "LICENSE",
            "AGENTS.md",
            "dev.ts",
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
  await cp(
    join(dir, "starter/backend"),
    join(templateDir, "packages/backend"),
    {
      recursive: true,
    },
  );
  const backendManifestPath = join(
    templateDir,
    "packages/backend/package.json",
  );
  const backendManifest = await Bun.file(backendManifestPath).json();
  for (const dependency of [
    "@convex-dev/workflow",
    "@octokit/rest",
    "@vercel/connect",
    "libsodium-wrappers",
    "node-forge",
  ])
    delete backendManifest.dependencies[dependency];
  delete backendManifest.devDependencies["@types/node-forge"];
  await Bun.write(
    backendManifestPath,
    JSON.stringify(backendManifest, null, 2) + "\n",
  );
  // The generator runs outside the app and must not remain in its workspace.
  const lockPath = join(templateDir, "bun.lock");
  const lock = Bun.JSONC.parse(await Bun.file(lockPath).text()) as {
    workspaces: Record<string, unknown>;
    packages: Record<string, unknown>;
  };
  delete lock.workspaces["packages/create-disposabl-app"];
  delete lock.packages["create-disposabl-app"];
  lock.workspaces["packages/backend"] = {
    name: backendManifest.name,
    version: backendManifest.version,
    dependencies: backendManifest.dependencies,
    devDependencies: backendManifest.devDependencies,
  };
  await Bun.write(lockPath, JSON.stringify(lock, null, 2) + "\n");
  const turboPath = join(templateDir, "turbo.json");
  const turbo = await Bun.file(turboPath).json();
  delete turbo.tasks["create-disposabl-app#build"];
  await Bun.write(turboPath, JSON.stringify(turbo, null, 2) + "\n");
  // npm omits .gitignore files from packed templates.
  for (const path of await readdir(templateDir, { recursive: true })) {
    if (basename(path) === ".gitignore") {
      await rename(
        join(templateDir, path),
        join(templateDir, path.replace(/\.gitignore$/, "gitignore")),
      );
    }
  }
  console.log("Built CLI and bundled app source.");
}
