import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../create-disposabl-app/scaffold";
import {
  selectFeatures,
  selectPlatforms,
} from "../create-disposabl-app/options";

const template = resolve(
  import.meta.dirname,
  "../create-disposabl-app/dist/templates/default",
);
const profiles = [
  { name: "web-minimal", platforms: "web", features: "none" },
  { name: "web-android", platforms: "web,android", features: "authentication" },
  { name: "mobile-minimal", platforms: "web,android,ios", features: "none" },
  {
    name: "all-platforms",
    platforms: "web,android,ios,macos,windows,linux,api,mcp,cli,typescript-sdk",
    features: "authentication,payments,analytics,docs",
  },
];
const selected = process.argv[2];
if (selected && !profiles.some((profile) => profile.name === selected)) {
  throw new Error(`Unknown starter profile: ${selected}`);
}
const root = await mkdtemp(join(tmpdir(), "disposabl-starter-ci-"));
try {
  for (const profile of profiles.filter(
    (profile) => !selected || profile.name === selected,
  )) {
    const cwd = join(root, profile.name);
    console.log(`\nVerifying fresh starter: ${profile.name}`);
    await createApp(template, cwd, profile.name, {
      version: "test",
      platforms: selectPlatforms(profile.platforms),
      features: selectFeatures(profile.features),
    });
    const tests = (await readdir(join(cwd, "packages/tests")))
      .filter((file) => file.endsWith(".test.ts"))
      .sort()
      .map((file) => `./packages/tests/${file}`);
    // Match CLI setup, then verify the frozen install used by the first CI run.
    for (const args of [
      ["fmt"],
      ["install"],
      ["install", "--frozen-lockfile"],
      ["run", "check"],
      ["test", ...tests],
      ...["cli", "sdk"]
        .filter((name) =>
          existsSync(join(cwd, "packages", name, "package.json")),
        )
        .map((name) => ["run", "--cwd", `packages/${name}`, "build"]),
      ["run", "build", "--filter=@disposabl/web"],
    ]) {
      const child = spawn(process.execPath, args, {
        cwd,
        env: {
          ...process.env,
          E2E_TELEMETRY_DISABLED: "1",
          VITE_CONVEX_URL: "https://starter-check.convex.cloud",
          VITE_CONVEX_SITE_URL: "https://starter-check.convex.site",
        },
        stdio: "inherit",
      });
      await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) =>
          code === 0
            ? resolve()
            : reject(
                new Error(`${profile.name}: bun ${args.join(" ")} failed`),
              ),
        );
      });
    }
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
