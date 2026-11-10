import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const runtime = "a".repeat(40);
const build = {
  id: "build-id",
  status: "FINISHED",
  platform: "IOS",
  distribution: "STORE",
  isForIosSimulator: false,
  app: { id: "project" },
  appIdentifier: "app.test",
  buildProfile: "ios-production",
  updateChannel: { name: "production" },
  runtime: { version: runtime },
  artifacts: { applicationArchiveUrl: "https://example.test/app.ipa" },
};

async function run(
  operation: string,
  values: Record<string, string | undefined> = {},
) {
  const dir = await mkdtemp(join(tmpdir(), "ios-ota-"));
  try {
    await mkdir(join(dir, "bin"));
    await mkdir(join(dir, "apps/mobile/scripts"), { recursive: true });
    await writeFile(
      join(dir, "apps/mobile/scripts/production-analytics.mjs"),
      await readFile(
        resolve(
          import.meta.dirname,
          "../../apps/mobile/scripts/production-analytics.mjs",
        ),
      ),
    );
    await mkdir(join(dir, "apps/web"), { recursive: true });
    await writeFile(
      join(dir, "apps/mobile/eas.json"),
      JSON.stringify({ build: { "ios-production": {}, "ios-preview": {} } }),
    );
    await writeFile(join(dir, "apps/web/site.json"), "{}");
    await writeFile(
      join(dir, "disposabl.json"),
      JSON.stringify({ features: [] }),
    );
    await mkdir(join(dir, ".github/scripts"), { recursive: true });
    await writeFile(
      join(dir, ".github/scripts/disposabl.mjs"),
      `import {appendFileSync} from "node:fs"; appendFileSync(process.env.TRACE, JSON.stringify(process.argv.slice(2)) + "\\n");`,
    );
    await writeFile(
      join(dir, "bin/bun"),
      `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TRACE, JSON.stringify(args) + '\\n');
if (args[0] === '-e') {
 require('node:child_process').execFileSync(process.env.REAL_BUN, args, {stdio:'inherit'});
} else if (args.includes('env:pull')) {
 fs.writeFileSync(process.env.RUNNER_TEMP + '/expo.env', Object.entries(JSON.parse(process.env.EAS_VARS || '{}')).map(([k,v]) => k+'='+JSON.stringify(v)).join('\\n'));
} else if (args.includes('submit:list')) {
 if (process.env.QUERY_ERROR) process.exit(4);
 console.log(process.env.SUBMISSIONS || '[]');
} else if (args.includes('submit')) {
 if (process.env.SUBMIT_ERROR) process.exit(6);
} else if (args.includes('runtimeversion:resolve')) {
 const hash = process.env.DRIFT && fs.existsSync(process.env.EXPORTED) ? 'b'.repeat(40) : '${runtime}';
 console.log(JSON.stringify({runtimeVersion:hash, fingerprintSources:[]}));
} else if (args.includes('config')) console.log(JSON.stringify({extra:{eas:{projectId:'project'}},ios:{bundleIdentifier:'app.test'}}));
else if (args.includes('build:list')) {
 if (process.env.QUERY_ERROR) process.exit(4);
 console.log(process.env.BUILDS);
} else if (args.includes('export')) fs.writeFileSync(process.env.EXPORTED, 'yes');
else if (!args.includes('update')) process.exit(5);
`,
      { mode: 0o755 },
    );
    await writeFile(
      join(dir, "bin/gh"),
      "#!/usr/bin/env node\nconsole.log(process.env.STALE ? 'old' : process.env.SOURCE);\n",
      { mode: 0o755 },
    );
    const output = join(dir, "output");
    const trace = join(dir, "trace");
    await writeFile(output, "");
    await writeFile(trace, "");
    const result = spawnSync(
      "bash",
      [
        resolve(
          import.meta.dirname,
          operation === "expo-env"
            ? "../../.github/scripts/mobile.sh"
            : "../../.github/scripts/apple.sh",
        ),
        operation,
      ],
      {
        cwd: join(dir, "apps/mobile"),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${join(dir, "bin")}:${process.env.PATH}`,
          RUNNER_TEMP: dir,
          GITHUB_WORKSPACE: dir,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: join(dir, "summary"),
          TRACE: trace,
          EXPORTED: join(dir, "exported"),
          EXPO_PROJECT_ID: "project",
          CHANNEL: "production",
          EAS_ENVIRONMENT: "production",
          EAS_CLI: "eas-cli@27.2.0",
          GH_REPO: "test/app",
          SOURCE_PATH: "git/ref/heads/main",
          SOURCE: "source",
          RUNTIME: runtime,
          REAL_BUN: process.execPath,
          GITHUB_ENV: join(dir, "github-env"),
          CONVEX_URL: "https://deployed.convex.cloud",
          CONVEX_SITE_URL: "https://deployed.convex.site",
          BUILD_ID: "build-id",
          ASC_APP_ID: "123456",
          BUILDS: JSON.stringify([build]),
          ...values,
        },
      },
    );
    return {
      status: result.status,
      stderr: result.stderr,
      output: await readFile(output, "utf8"),
      trace: await readFile(trace, "utf8"),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("iOS reuses only a matching finished production binary", async () => {
  const result = await run("ota-plan");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.output, /action=update/);
  assert.match(result.trace, /"--build-profile","ios-production"/);
  assert.match(result.trace, /"--channel","production"/);
  assert.match(result.trace, /"--app-identifier","app.test"/);
  for (const candidate of [
    null,
    { ...build, runtime: { version: "different" } },
    { ...build, isForIosSimulator: true },
    { ...build, app: { id: "other" } },
    { ...build, updateChannel: { name: "preview" } },
    { ...build, artifacts: {} },
  ]) {
    const mismatch = await run("ota-plan", {
      BUILDS: JSON.stringify(candidate ? [candidate] : []),
    });
    assert.equal(mismatch.status, 0, mismatch.stderr);
    assert.match(mismatch.output, /action=build/);
  }
});

test("iOS build lookup errors do not trigger a replacement build", async () => {
  for (const values of [
    { QUERY_ERROR: "1" },
    { BUILDS: "{}" },
    { BUILDS: "invalid" },
  ]) {
    const result = await run("ota-plan", values);
    assert.notEqual(result.status, 0);
    assert.equal(result.output, "");
  }
});

test("iOS OTA exports once and publishes the checked runtime and channel", async () => {
  const result = await run("ota");
  assert.equal(result.status, 0, result.stderr);
  const commands = result.trace
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as string[]);
  assert.equal(commands.filter((args) => args.includes("export")).length, 1);
  const publish = commands.find((args) => args.includes("update"));
  assert.ok(publish);
  assert.deepEqual(publish.slice(0, 8), [
    "x",
    "eas-cli@27.2.0",
    "update",
    "--platform",
    "ios",
    "--channel",
    "production",
    "--environment",
  ]);
  assert.ok(publish.includes("--skip-bundler"));
});

test("stale source or runtime drift prevents iOS OTA publication", async () => {
  for (const values of [{ STALE: "1" }, { DRIFT: "1" }]) {
    const result = await run("ota", values);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.trace, /"update",/);
  }
});

test("missing and failed submissions recover using the existing native binary", async () => {
  for (const submissions of [
    [],
    [{ submittedBuild: { id: "build-id" }, status: "ERRORED" }],
  ]) {
    const result = await run("deliver", {
      SUBMISSIONS: JSON.stringify(submissions),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.trace, /"submit","--platform","ios","--id","build-id"/);
    assert.doesNotMatch(result.trace, /"build",/);
    assert.match(result.trace, /"ready"/);
  }
});

test("finished or pending submissions are not duplicated", async () => {
  for (const status of [
    "FINISHED",
    "IN_QUEUE",
    "IN_PROGRESS",
    "AWAITING_BUILD",
  ]) {
    const result = await run("deliver", {
      SUBMISSIONS: JSON.stringify([
        { submittedBuild: { id: "build-id" }, status },
      ]),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.trace, /"submit",/);
    assert.match(result.trace, status === "FINISHED" ? /"ready"/ : /"blocked"/);
  }
});

test("delivery stays blocked without credentials and fails on provider errors", async () => {
  const missing = await run("deliver", { ASC_APP_ID: "" });
  assert.equal(missing.status, 0, missing.stderr);
  assert.match(missing.trace, /"blocked"/);
  assert.doesNotMatch(missing.trace, /"submit",/);
  for (const values of [{ QUERY_ERROR: "1" }, { SUBMIT_ERROR: "1" }]) {
    const failed = await run("deliver", values);
    assert.notEqual(failed.status, 0);
    assert.doesNotMatch(failed.trace, /"ready"/);
  }
});

test("every EAS backend alias must match the deployed backend before publication", async () => {
  const matching: Record<string, string> = {};
  for (const prefix of ["", "VITE_", "EXPO_PUBLIC_"]) {
    for (const suffix of ["URL", "SITE_URL"]) {
      const key = `${prefix}CONVEX_${suffix}`;
      const result = await run("expo-env", {
        EAS_VARS: JSON.stringify({ [key]: "https://wrong.example" }),
      });
      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        new RegExp(`EAS overrides the deployed backend: ${key}`),
      );
      matching[key] =
        suffix === "URL"
          ? "https://deployed.convex.cloud"
          : "https://deployed.convex.site";
    }
  }
  const result = await run("expo-env", { EAS_VARS: JSON.stringify(matching) });
  assert.equal(result.status, 0, result.stderr);
});

test("EAS environment cannot replace Android signing or submission policy", async () => {
  for (const key of [
    "ANDROID_KEYSTORE_BASE64",
    "ANDROID_KEYSTORE_PASSWORD",
    "ANDROID_KEY_ALIAS",
    "ANDROID_KEY_PASSWORD",
    "ANDROID_KEYSTORE_PATH",
    "ANDROID_SIGNING_ID",
    "ANDROID_PLAY_SUBMIT",
    "ANDROID_PLAY_UPLOAD_CERT_SHA256",
    "UPDATE_POLICY",
  ]) {
    const result = await run("expo-env", {
      EAS_VARS: JSON.stringify({ [key]: "fixture-override" }),
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`Reserved EAS variable: ${key}`));
  }
});
