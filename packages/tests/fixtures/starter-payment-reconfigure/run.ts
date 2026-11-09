import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, statfsSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createOutputDirectory } from "./output";

const root = resolve(import.meta.dirname, "../../../..");
const requested = process.env.STARTER_QUALIFICATION_DIR;
const cache = process.env.STARTER_BUN_CACHE;
if (!requested || !cache || !cache.startsWith("/"))
  throw new Error(
    "Set STARTER_QUALIFICATION_DIR to a new /tmp path and STARTER_BUN_CACHE to an absolute cache path.",
  );
const work = await createOutputDirectory(requested);
const home = join(work, "home");
await mkdir(home);
const env = {
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  HOME: home,
  TMPDIR: work,
  LANG: "en_US.UTF-8",
  CI: "1",
  DO_NOT_TRACK: "1",
  E2E_TELEMETRY_DISABLED: "1",
  EXPO_NO_TELEMETRY: "1",
  EXPO_NO_DOTENV: "1",
  EXPO_OFFLINE: "1",
  EXPO_PUBLIC_E2E: "true",
  DISPOSABL_MOBILE_CHANNEL: "qualification",
  EXPO_PUBLIC_CONVEX_URL: "http://127.0.0.1:1",
  EXPO_PUBLIC_CONVEX_SITE_URL: "http://127.0.0.1:2",
  BUN_INSTALL_CACHE_DIR: cache,
  DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN: "phc_synthetic",
  DISPOSABL_CLI_POSTHOG_HOST: "https://us.i.posthog.com",
};
function space() {
  const fs = statfsSync(work);
  if (fs.bavail * fs.bsize < 2.5 * 1024 ** 3)
    throw new Error(
      "Less than 2.5 GiB free; stopping before further large work.",
    );
}
function run(command: string, args: string[], cwd: string) {
  space();
  console.log(`\n$ ${command} ${args.join(" ")} (cwd ${cwd})`);
  execFileSync(command, args, { cwd, env, stdio: "inherit" });
}
const source = join(work, "source");
await mkdir(source);
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  env,
  encoding: "utf8",
}).trim();
run("git", ["archive", "--output", join(work, "source.tar"), commit], root);
run("tar", ["-xf", join(work, "source.tar"), "-C", source], root);
await symlink(join(root, "node_modules"), join(source, "node_modules"));
const { createApp } = await import(
  pathToFileURL(join(source, "packages/create-disposabl-app/scaffold.ts")).href
);
const { reconfigureApp } = await import(
  pathToFileURL(join(source, "packages/create-disposabl-app/reconfigure.ts"))
    .href
);
const { version } = JSON.parse(
  await readFile(
    join(source, "packages/create-disposabl-app/package.json"),
    "utf8",
  ),
);
await writeFile(
  join(work, "provenance.json"),
  JSON.stringify(
    {
      commit,
      generatorVersion: version,
      source,
      localSourceQualification: true,
    },
    null,
    2,
  ) + "\n",
);
// Build the actual template with only its lockfile-resolution command forced offline.
const buildFile = join(source, "packages/create-disposabl-app/build.ts");
const build = await readFile(buildFile, "utf8");
const original =
  '[process.execPath, "install", "--lockfile-only", "--ignore-scripts"]';
assert.equal(
  build.split(original).length,
  2,
  "generator build command changed",
);
await writeFile(
  buildFile,
  build.replace(
    original,
    '[process.execPath, "install", "--offline", "--lockfile-only", "--ignore-scripts"]',
  ),
);
run("bun", ["run", "build"], join(source, "packages/create-disposabl-app"));
const template = join(
  source,
  "packages/create-disposabl-app/dist/templates/default",
);
const app = join(work, "app");
await createApp(template, app, "payment-reconfigure-fixture", {
  version,
  platforms: ["web", "android", "ios"],
  features: ["authentication"],
});
const manifestPath = join(app, "apps/mobile/package.json");
const userFile = join(app, "apps/mobile/src/user-preserved.ts");
const userContents = 'export const userPreserved = "fixture";\n';
await writeFile(userFile, userContents);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.dependencies["is-number"] = "7.0.0";
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
const read = (path: string) => readFile(join(app, path), "utf8");
async function verify(enabled: boolean) {
  const mobile = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(mobile.dependencies["is-number"], "7.0.0");
  for (const name of ["react-native-purchases", "react-native-purchases-ui"])
    assert.equal(Boolean(mobile.dependencies[name]), enabled, name);
  assert.deepEqual(mobile.expo.autolinking.ios.buildFromSource, ["expo-image"]);
  assert.match(
    await read("apps/mobile/app.config.js"),
    /\.\/plugins\/with-android-signing\.js/,
  );
  assert.equal(await readFile(userFile, "utf8"), userContents);
  const config = JSON.parse(
    execFileSync(
      "bun",
      ["run", "expo", "config", "--type", "public", "--json"],
      { cwd: join(app, "apps/mobile"), env, encoding: "utf8" },
    ),
  );
  const properties = config.plugins.filter(
    (plugin: unknown) =>
      Array.isArray(plugin) && plugin[0] === "expo-build-properties",
  );
  assert.equal(properties.length, 1);
  assert.ok(
    properties[0][1].ios.extraPods.some(
      (pod: { name: string; version: string }) =>
        pod.name === "ReachabilitySwift" && pod.version === "5.2.3",
    ),
  );
  const baseConfig = JSON.parse(await read("apps/mobile/app.json")).expo;
  for (const key of ["name", "slug", "version", "orientation", "icon"])
    assert.deepEqual(config[key], baseConfig[key], key);
  const schemes = [config.scheme ?? []].flat();
  for (const scheme of [baseConfig.scheme ?? []].flat())
    assert.ok(schemes.includes(scheme), `base scheme ${scheme} preserved`);
  const packageName = JSON.parse(await read("package.json")).name;
  const suffix = createHash("sha256")
    .update(packageName)
    .digest("hex")
    .slice(0, 12);
  assert.deepEqual(
    schemes.filter((scheme: string) => scheme.startsWith("disposabl-billing-")),
    enabled
      ? [`disposabl-billing-${suffix}-${env.DISPOSABL_MOBILE_CHANNEL}`]
      : [],
  );
  assert.equal(
    config.extra?.billingReturnChannel,
    enabled ? env.DISPOSABL_MOBILE_CHANNEL : undefined,
  );
  await writeFile(
    join(work, `expo-config-${enabled ? "on" : "off"}.json`),
    JSON.stringify(config, null, 2) + "\n",
  );
  assert.equal(
    existsSync(
      join(app, "packages/disposabl-kit/mobile/billing/account-billing.tsx"),
    ),
    enabled,
  );
}
async function qualify(stage: string) {
  run("bun", ["install", "--offline", "--ignore-scripts"], app);
  run(
    "bun",
    ["install", "--offline", "--frozen-lockfile", "--ignore-scripts"],
    app,
  );
  await verify(stage === "on");
  run(
    "python3",
    [
      "-c",
      `import sys;sys.path.insert(0,${JSON.stringify(join(root, "packages/tests/helpers/sdk-auth"))});from selected_auth import verify_selected_auth;print(verify_selected_auth(${JSON.stringify(app)}))`,
    ],
    app,
  );
  for (const workspace of [
    "packages/backend",
    "apps/web",
    "apps/mobile",
    "packages/tests",
  ])
    run("bun", ["run", "--cwd", workspace, "typecheck"], app);
  for (const platform of ["android", "ios"])
    run(
      "bun",
      [
        "run",
        "--cwd",
        "apps/mobile",
        "expo",
        "export",
        "--platform",
        platform,
        "--output-dir",
        join(work, `export-${stage}-${platform}`),
      ],
      app,
    );
}
run("bun", ["install", "--offline", "--ignore-scripts"], app);
run(
  "bun",
  ["install", "--offline", "--frozen-lockfile", "--ignore-scripts"],
  app,
);
await verify(false);
await reconfigureApp(template, app, version, { features: "payments" });
await qualify("on");
await reconfigureApp(template, app, version, { features: "authentication" });
await qualify("off");
console.log(`Qualified payments on/off. Artifacts retained at ${work}`);
