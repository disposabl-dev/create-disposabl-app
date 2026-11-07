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
  "packages/cli",
  "packages/create-disposabl-app",
  "starter",
  ".github/workflows",
  "apps/web/src/router",
  "apps/mobile/src/app/index.tsx",
  "apps/mobile/src/app/_layout.tsx",
  "apps/mobile/src/app/settings.tsx",
  "apps/mobile/src/app/(authenticated)/apps",
  "apps/mobile/src/features/management",
  "apps/mobile/src/features/studio",
  "apps/mobile/src/app/(tabs)",
  "apps/mobile/src/app/compose.tsx",
  "apps/mobile/src/app/connections.tsx",
  "apps/mobile/src/app/example.tsx",
  "apps/mobile/src/app/guide-detail.tsx",
  "packages/tests/flows/mobile.e2e.ts",
  "packages/tests/flows/mobile-management.e2e.ts",
  "packages/tests/flows/connections-onboarding.e2e.ts",
  "packages/tests/connections-flow.test.ts",
  "packages/tests/configuration.test.ts",
  "packages/tests/agent-access.test.ts",
  "packages/tests/agent-bootstrap.test.ts",
  "packages/tests/agent-creation.test.ts",
  "packages/tests/autumn-connections.test.ts",
  "packages/tests/platform-connections.test.ts",
  "packages/tests/browser-handoff.test.ts",
  "packages/tests/helpers/browser-handoff.ts",
  "packages/tests/flows/browser-handoff.e2e.ts",
  "apps/web/site.json",
  "apps/web/public/og",
  "apps/web/src/components/connections",
  "apps/web/src/components/agent-onboarding",
  "packages/tests/flows/agent-onboarding.e2e.ts",
  "packages/tests/flows/github-identity.e2e.ts",
  "bun.lock",
  "packages/tests/flows/agent.e2e.ts",
  "turbo.json",
];
const pending = [""];
while (pending.length) {
  const directory = pending.pop()!;
  for (const entry of await readdir(join(root, directory), {
    withFileTypes: true,
  })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (
      !touched.some(
        (target) =>
          path === target ||
          path.startsWith(target + "/") ||
          target.startsWith(path + "/"),
      )
    )
      continue;
    if (entry.isSymbolicLink())
      throw new Error(`Unexpected symlink in staging copy: ${path}`);
    if (entry.isDirectory()) pending.push(path);
  }
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
  "authSetup.ts",
  "authEmail.ts",
  "emails.ts",
  "telemetry.ts",
  "auth.config.ts",
  "mcp.ts",
  "tsconfig.json",
  "users",
  "files",
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

const starterCopies = [
  ["starter/web/index.tsx", "apps/web/src/router/index.tsx"],
  ["starter/cli/README.md", "packages/cli/README.md"],
  ["starter/cli/commands.ts", "packages/cli/commands.ts"],
  [
    "starter/web/dashboard.tsx",
    "apps/web/src/router/_authenticated/dashboard.tsx",
  ],
  ["starter/mobile/index.tsx", "apps/mobile/src/app/index.tsx"],
  ["starter/mobile/settings.tsx", "apps/mobile/src/app/settings.tsx"],
  ["starter/mobile/layout.tsx", "apps/mobile/src/app/_layout.tsx"],
  ["starter/mobile/mobile.e2e.ts", "packages/tests/flows/mobile.e2e.ts"],
] as const;
for (const [source] of starterCopies) await readFile(join(root, source));

// Generated apps start with their own origin and copy, never Disposabl's SEO.
await Bun.write(
  join(root, "apps/web/site.json"),
  JSON.stringify(
    {
      name: "My App",
      title: "My App",
      description: "A clean starting point for your next application.",
      origin: "",
      backendOrigin: "",
      image: "",
      imageAlt: "",
      analytics: false,
    },
    null,
    2,
  ) + "\n",
);
await rm(join(root, "apps/web/public/og"), { recursive: true, force: true });

for (const entry of await readdir(convex)) {
  if (!keep.has(entry))
    await rm(join(convex, entry), { recursive: true, force: true });
}
for (const path of [
  "packages/backend/generated",
  "packages/sdk/src/generated",
  "packages/create-disposabl-app",
  ".github/workflows/publish.yml",
  "apps/web/src/router/_authenticated/dashboard.connections.tsx",
  "apps/mobile/src/app/(authenticated)/apps",
  "apps/mobile/src/features/management",
  "apps/mobile/src/features/studio",
  "apps/mobile/src/app/(tabs)",
  "apps/mobile/src/app/compose.tsx",
  "apps/mobile/src/app/connections.tsx",
  "apps/mobile/src/app/example.tsx",
  "apps/mobile/src/app/guide-detail.tsx",
  "packages/tests/flows/mobile-management.e2e.ts",
  "packages/tests/flows/connections-onboarding.e2e.ts",
  "packages/tests/connections-flow.test.ts",
  "packages/tests/configuration.test.ts",
  "packages/tests/agent-access.test.ts",
  "packages/tests/agent-bootstrap.test.ts",
  "packages/tests/agent-creation.test.ts",
  "packages/tests/autumn-connections.test.ts",
  "packages/tests/platform-connections.test.ts",
  "packages/tests/browser-handoff.test.ts",
  "packages/tests/helpers/browser-handoff.ts",
  "packages/tests/flows/browser-handoff.e2e.ts",
  "apps/web/src/components/connections",
  "apps/web/src/components/agent-onboarding",
  "packages/tests/flows/agent-onboarding.e2e.ts",
  "packages/tests/flows/agent.e2e.ts",
  "packages/tests/flows/github-identity.e2e.ts",
])
  await rm(join(root, path), { recursive: true, force: true });
await cp(join(root, "starter/backend"), join(root, "packages/backend"), {
  recursive: true,
});
for (const [source, destination] of starterCopies)
  await cp(join(root, source), join(root, destination));

for (const dependency of [
  "@convex-dev/workflow",
  "@convex-dev/agent",
  "@boatdev/convex",
  "@octokit/rest",
  "@vercel/connect",
  "libsodium-wrappers",
  "node-forge",
])
  delete backend.dependencies[dependency];
delete backend.devDependencies["@types/node-forge"];
for (const file of ["delete.ts", "preview.ts", "repository.ts"])
  await rm(join(root, "packages/cli", file));
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
