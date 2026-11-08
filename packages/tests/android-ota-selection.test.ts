import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function verifyOtaSelection() {
  for (const [channel, tag, reusable, architectures] of [
    ["pr-1", "app-pr-1-android", true],
    ["production", "app-production-android", true],
    ["production", "app-production-android-8-1", true],
    ["pr-1", "app-pr-1", false],
    ["production", "app-production", false],
    ["pr-1", "app-pr-1-android-8-1", false],
    ["production", "app-production-android-invalid", false],
    ["pr-1", "app-pr-2-android", false],
    ["pr-1", "app-pr-1-windows", false],
    ["production", "app-production-android-8-1", false, ["arm64-v8a"]],
    ["production", "app-production-android-8-1", false, null],
  ] as const) {
    const cwd = mkdtempSync(join(tmpdir(), "android-ota-selection-"));
    try {
      mkdirSync(join(cwd, "bin"));
      const runtime = "b".repeat(40);
      const hash = "a".repeat(64);
      const manifest = {
        channel,
        projectId: "project",
        applicationId: "app.fixture",
        runtimeVersion: runtime,
        ...(architectures === null
          ? {}
          : { androidArchitectures: architectures ?? ["arm64-v8a", "x86_64"] }),
        sha256: hash,
      };
      const release = {
        id: 1,
        tag_name: tag,
        draft: false,
        body: `<!-- android ${JSON.stringify(manifest)} -->`,
        assets: [
          {
            name: "android.apk",
            state: "uploaded",
            size: 1,
            digest: `sha256:${hash}`,
          },
        ],
      };
      writeFileSync(
        join(cwd, "bin/gh"),
        `#!${process.execPath}\nconsole.log(${JSON.stringify(JSON.stringify([release]))});\n`,
        { mode: 0o755 },
      );
      writeFileSync(
        join(cwd, "bin/bun"),
        `#!${process.execPath}
const args=process.argv.slice(2);
if(args[0]==="-e") {
  const child=Bun.spawnSync([process.execPath,...args],{stdout:"inherit",stderr:"inherit"});
  process.exit(child.exitCode);
}
if(args.includes("config")) console.log(JSON.stringify({android:{package:"app.fixture"},extra:{eas:{projectId:"project"},disposablAndroidArchitectures:["arm64-v8a","x86_64"]}}));
else if(args.includes("runtimeversion:resolve")) console.log(JSON.stringify({runtimeVersion:"${runtime}",fingerprintSources:[]}));
else process.exit(1);
`,
        { mode: 0o755 },
      );
      const output = join(cwd, "output");
      const result = spawnSync(
        "bash",
        [
          resolve(import.meta.dirname, "../../.github/scripts/mobile.sh"),
          "expo-fingerprint",
        ],
        {
          cwd,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${join(cwd, "bin")}:${process.env.PATH}`,
            RUNNER_TEMP: cwd,
            GH_REPO: "fixture/app",
            CHANNEL: channel,
            RELEASE_PREFIX: "app",
            GITHUB_OUTPUT: output,
            ANDROID_SIGNING_READY: "true",
          },
        },
      );
      assert.equal(
        result.status,
        0,
        `${tag}: ${result.stdout}${result.stderr}`,
      );
      const selected = readFileSync(output, "utf8");
      assert.ok(
        selected.includes(`build=${!reusable}\n`),
        `${tag}: ${selected}`,
      );
      assert.ok(
        selected.includes(`tag=${reusable ? tag : ""}\n`),
        `${tag}: ${selected}`,
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
}

test(
  "OTA selection accepts only source tags supported by the trusted publisher",
  { timeout: 30000 },
  verifyOtaSelection,
);
