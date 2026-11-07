import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

const script = resolve(import.meta.dirname, "../../.github/scripts/release.sh");
const binary = "verified native APK fixture";
const sha256 = createHash("sha256").update(binary).digest("hex");
const source = "a".repeat(40);

function publish(
  options: { production?: boolean; native?: boolean; fault?: string } = {},
) {
  const cwd = mkdtempSync(join(tmpdir(), "android-ota-artifacts-"));
  try {
    for (const path of ["bin", ".github/scripts", "artifacts/release-android"])
      mkdirSync(join(cwd, path), { recursive: true });
    const channel = options.production ? "production" : "pr-1";
    const sourceTag = `app-${channel}-android${options.production ? "-8-1" : ""}`;
    const manifest = {
      channel,
      projectId: "project",
      applicationId: "app.fixture",
      runtimeVersion: "b".repeat(40),
      sha256,
      action: options.native ? "build" : "update",
      sourceTag,
    };
    const prior = { ...manifest };
    if (options.fault === "runtime") prior.runtimeVersion = "c".repeat(40);
    if (options.fault === "channel") prior.channel = "pr-2";
    if (options.fault === "project") prior.projectId = "different";
    if (options.fault === "application") prior.applicationId = "app.different";
    if (options.fault === "tag") manifest.sourceTag = "app-pr-2-android";
    writeFileSync(
      join(cwd, "artifacts/release-android/android.json"),
      JSON.stringify(manifest),
    );
    if (options.native)
      writeFileSync(join(cwd, "artifacts/release-android/android.apk"), binary);
    writeFileSync(
      join(cwd, "fixture.json"),
      JSON.stringify({
        ...options,
        binary,
        source,
        sourceTag,
        release: {
          isDraft: options.fault === "draft",
          draft: options.fault === "draft",
          body: `<!-- android ${JSON.stringify(prior)} -->`,
          assets:
            options.fault === "missing"
              ? []
              : [
                  {
                    name: "android.apk",
                    state: "uploaded",
                    size: binary.length,
                    digest: `sha256:${options.fault === "digest" ? "d".repeat(64) : sha256}`,
                  },
                ],
        },
      }),
    );
    writeFileSync(
      join(cwd, "bin/gh"),
      `#!${process.execPath}
import {readFileSync, writeFileSync, appendFileSync, existsSync} from "node:fs";
import {join} from "node:path";
const args = process.argv.slice(2);
const f = JSON.parse(readFileSync(process.env.FIXTURE, "utf8"));
appendFileSync("commands.jsonl", JSON.stringify(args) + "\\n");
if (args[0] === "api" && args[1].includes("/releases/tags/")) {
  console.log(JSON.stringify(f.release));
} else if (args[0] === "api") {
  console.log(args.includes("PATCH") ? "{}" : f.fault === "stale" || (f.fault === "stale-after-download" && existsSync("downloaded")) ? "stale" : f.source);
} else if (args[1] === "view") {
  if (f.production && args[2] !== f.sourceTag) process.exit(1);
  console.log(JSON.stringify(f.release));
} else if (args[1] === "download") {
  if (f.fault === "download") process.exit(1);
  writeFileSync(join(args[args.indexOf("--dir") + 1], "android.apk"), f.fault === "corrupt" ? "corrupt" : f.binary);
  writeFileSync("downloaded", "yes");
}
`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(cwd, ".github/scripts/disposabl.mjs"),
      'import {writeFileSync} from "node:fs"; writeFileSync("reported", process.argv.slice(2).join(" "));',
    );
    const result = spawnSync("bash", [script, "release-publish"], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${join(cwd, "bin")}:${process.env.PATH}`,
        FIXTURE: join(cwd, "fixture.json"),
        RUNNER_TEMP: cwd,
        GH_REPO: "fixture/app",
        SOURCE: source,
        CHANNEL: channel,
        PR: "1",
        PRERELEASE: String(!options.production),
        GITHUB_RUN_ID: "9",
        GITHUB_RUN_ATTEMPT: "1",
      },
    });
    const commands: string[][] = readFileSync(
      join(cwd, "commands.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    return {
      status: result.status,
      output: result.stdout + result.stderr,
      commands,
    };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("metadata-only OTA restores the verified APK for PR and production publication", () => {
  for (const production of [false, true]) {
    const result = publish({ production });
    assert.equal(result.status, 0, result.output);
    assert.equal(
      result.commands.filter((args) => args[1] === "download").length,
      1,
    );
    const published = result.commands.find(
      (args) => args[1] === (production ? "create" : "upload"),
    )!;
    assert.ok(published.includes("artifacts/release-android/android.apk"));
    assert.equal(
      published[2],
      production ? "app-production-android-9-1" : "app-pr-1-android",
    );
    assert.equal(
      result.commands.some((args) => args[1] === "delete-asset"),
      false,
    );
  }
});

test("OTA reuse rejects mismatched, missing, corrupt and stale inputs before publication", () => {
  for (const fault of [
    "runtime",
    "channel",
    "project",
    "application",
    "tag",
    "draft",
    "missing",
    "digest",
    "corrupt",
    "download",
    "stale",
    "stale-after-download",
  ]) {
    const result = publish({ fault });
    assert.notEqual(result.status, 0, fault);
    assert.equal(
      result.commands.some((args) =>
        ["upload", "create", "edit", "delete-asset"].includes(args[1]),
      ),
      false,
      fault,
    );
  }
});

test("native builds still publish their supplied APK without reuse", () => {
  const result = publish({ native: true });
  assert.equal(result.status, 0, result.output);
  assert.equal(
    result.commands.some((args) => args[1] === "download"),
    false,
  );
  assert.ok(
    result.commands
      .find((args) => args[1] === "upload")
      ?.includes("artifacts/release-android/android.apk"),
  );
});

test("OTA build verifies bytes before EAS publication and transfers only metadata", () => {
  for (const corrupt of [false, true]) {
    const cwd = mkdtempSync(join(tmpdir(), "android-ota-build-"));
    try {
      for (const path of ["bin", "apps/mobile"])
        mkdirSync(join(cwd, path), { recursive: true });
      writeFileSync(
        join(cwd, "bin/gh"),
        `#!${process.execPath}
import {writeFileSync} from "node:fs";
import {join} from "node:path";
const args=process.argv.slice(2);
if(args[0]==="api") console.log(${JSON.stringify(source)});
else writeFileSync(join(args[args.indexOf("--dir")+1],"android.apk"),${JSON.stringify(corrupt ? "corrupt" : binary)});
`,
        { mode: 0o755 },
      );
      writeFileSync(
        join(cwd, "bin/bun"),
        `#!${process.execPath}
import {writeFileSync,mkdirSync} from "node:fs";
const args=process.argv.slice(2);
if(args.includes("config")) console.log(JSON.stringify({android:{package:"app.fixture"},extra:{eas:{projectId:"project"}}}));
else if(args.includes("runtimeversion:resolve")) console.log(JSON.stringify({runtimeVersion:"${"b".repeat(40)}"}));
else if(args.includes("export")) mkdirSync("dist/update",{recursive:true});
else if(args.includes("update")) writeFileSync("../../published-update","yes");
else process.exit(1);
`,
        { mode: 0o755 },
      );
      const env = {
        ...process.env,
        PATH: `${join(cwd, "bin")}:${process.env.PATH}`,
        TAG: "app-pr-1-android",
        SHA: sha256,
        RUNTIME: "b".repeat(40),
        CHANNEL: "pr-1",
        SOURCE: source,
        GH_REPO: "fixture/app",
        SOURCE_PATH: "pulls/1",
        PLATFORM: "android",
        EAS_CLI: "fixture-eas",
        EAS_ENVIRONMENT: "preview",
        RUNNER_TEMP: cwd,
      };
      const result = spawnSync(
        "bash",
        [
          resolve(import.meta.dirname, "../../.github/scripts/mobile.sh"),
          "expo-update",
        ],
        { cwd, env, encoding: "utf8" },
      );
      if (corrupt) {
        assert.notEqual(result.status, 0);
        assert.throws(() => readFileSync(join(cwd, "published-update")));
      } else {
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.equal(
          readFileSync(join(cwd, "published-update"), "utf8"),
          "yes",
        );
        assert.throws(() =>
          readFileSync(join(cwd, "dist/release/android.apk")),
        );
        const file = join(cwd, "dist/release/android.json");
        const manifest = JSON.parse(readFileSync(file, "utf8"));
        assert.equal(manifest.sourceTag, env.TAG);
        assert.equal(manifest.sha256, sha256);
        assert.equal(
          spawnSync("bash", [script, "verify-artifacts"], { cwd, env }).status,
          0,
        );
        writeFileSync(file, JSON.stringify({ ...manifest, action: "build" }));
        assert.notEqual(
          spawnSync("bash", [script, "verify-artifacts"], { cwd, env }).status,
          0,
        );
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});
