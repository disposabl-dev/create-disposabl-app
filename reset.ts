import { cp, lstat, readdir, readFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";

// Run only in the generator's disposable staging copy, never the product repo.
const root = await realpath(import.meta.dir);
const marker = await readFile(join(root, ".disposabl-staging.json"), "utf8")
  .then(JSON.parse)
  .catch(() => {
    throw new Error(
      "Reset requires a generator staging copy; run the generator build.",
    );
  });
if (
  !marker ||
  typeof marker.source !== "string" ||
  typeof marker.directory !== "string" ||
  (await realpath(marker.directory)) !== root ||
  (await realpath(marker.source)) === root ||
  (await lstat(join(root, ".git")).catch(() => null))
)
  throw new Error(
    "Refusing to reset a working checkout or an invalid staging directory.",
  );

// Validate every required input before removing anything. Unrelated skill
// symlinks may be packaged, but reset must never read or write through a link.
const touched = [
  "packages/backend/convex",
  "packages/backend/generated",
  "packages/backend/package.json",
  "packages/backend/README.md",
  "packages/sdk/src",
  "packages/create-disposabl-app",
  "starter",
  ".github/workflows",
  "apps/web/src/router",
  "bun.lock",
  "turbo.json",
];
for (const path of await readdir(root, { recursive: true })) {
  const normalized = path.replaceAll("\\", "/");
  if (
    touched.some(
      (target) =>
        normalized === target ||
        normalized.startsWith(target + "/") ||
        target.startsWith(normalized + "/"),
    ) &&
    (await lstat(join(root, path))).isSymbolicLink()
  )
    throw new Error(`Unexpected symlink in staging copy: ${path}`);
}
const json = async (path: string) =>
  JSON.parse(await readFile(join(root, path), "utf8"));
const backendPath = "packages/backend/package.json";
const backend = await json(backendPath);
const lock = Bun.JSONC.parse(
  await readFile(join(root, "bun.lock"), "utf8"),
) as {
  workspaces: Record<string, unknown>;
  packages: Record<string, unknown>;
};
const turbo = await json("turbo.json");
if (
  !backend ||
  !lock ||
  !turbo ||
  backend.name !== "@disposabl/backend" ||
  !backend.dependencies ||
  !backend.devDependencies ||
  !lock.workspaces?.["packages/backend"] ||
  !lock.packages ||
  !turbo.tasks
)
  throw new Error(
    "Starter reset inputs changed: expected backend, lockfile, and Turbo metadata.",
  );
const convex = join(root, "packages/backend/convex");
const keep = new Set([
  "_generated",
  "auth.ts",
  "auth.config.ts",
  "mcp.ts",
  "mcpEnterprise",
  "tsconfig.json",
  "users",
]);
for (const entry of keep) await lstat(join(convex, entry));
for (const path of [
  "README.md",
  "convex/schema.ts",
  "convex/http.ts",
  "convex/convex.config.ts",
  "convex/_generated/api.d.ts",
  "convex/_generated/server.d.ts",
  "generated/platforms.ts",
  "generated/openapi.json",
  "generated/pages.json",
])
  await readFile(join(root, "starter/backend", path));

const dashboardPath = "apps/web/src/router/_authenticated/dashboard.tsx";
const connectionPath =
  "apps/web/src/router/_authenticated/dashboard.connections.tsx";
const dashboard = await readFile(join(root, dashboardPath), "utf8");
const connectionLink =
  '        <Link to="/dashboard/connections">Connections</Link>\n';
if (
  !dashboard.includes(connectionLink) &&
  ((await lstat(join(root, connectionPath)).catch(() => null)) ||
    dashboard.includes("/dashboard/connections"))
)
  throw new Error(
    "Connections navigation changed; update reset.ts before packaging.",
  );

for (const entry of await readdir(convex)) {
  if (!keep.has(entry))
    await rm(join(convex, entry), { recursive: true, force: true });
}
for (const path of [
  "packages/backend/generated",
  "packages/sdk/src/generated",
  "packages/create-disposabl-app",
  ".github/workflows/publish.yml",
  connectionPath,
])
  await rm(join(root, path), { recursive: true, force: true });
await cp(join(root, "starter/backend"), join(root, "packages/backend"), {
  recursive: true,
});
await Bun.write(
  join(root, dashboardPath),
  dashboard.replace(connectionLink, ""),
);

for (const dependency of [
  "@convex-dev/workflow",
  "@octokit/rest",
  "@vercel/connect",
  "libsodium-wrappers",
  "node-forge",
])
  delete backend.dependencies[dependency];
delete backend.devDependencies["@types/node-forge"];
delete lock.workspaces["packages/create-disposabl-app"];
delete lock.packages["create-disposabl-app"];
lock.workspaces["packages/backend"] = {
  name: backend.name,
  version: backend.version,
  dependencies: backend.dependencies,
  devDependencies: backend.devDependencies,
};
delete turbo.tasks["create-disposabl-app#build"];
for (const [path, value] of [
  [backendPath, backend],
  ["bun.lock", lock],
  ["turbo.json", turbo],
] as const)
  await Bun.write(join(root, path), JSON.stringify(value, null, 2) + "\n");
console.log("Reset staging copy to the starter.");
