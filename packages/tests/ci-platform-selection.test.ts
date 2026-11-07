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
import { execFileSync } from "node:child_process";
test("platform selection keeps iOS optional and sizes Android independently", () => {
  const dir = mkdtempSync(join(tmpdir(), "disposabl-platforms-"));
  try {
    mkdirSync(join(dir, "bin"));
    writeFileSync(
      join(dir, "bin/gh"),
      '#!/bin/sh\ncase "$*" in *pulls/1/files*) echo apps/mobile/src/app/index.tsx;; *) exit 1;; esac\n',
      { mode: 0o755 },
    );
    writeFileSync(
      join(dir, "disposabl.json"),
      JSON.stringify({ platforms: ["web", "android", "ios"], features: [] }),
    );
    const out = join(dir, "output");
    const env = {
      ...process.env,
      PATH: join(dir, "bin") + ":" + process.env.PATH,
      PR: "1",
      GH_REPO: "fixture/app",
      RUNNER_TEMP: dir,
      GITHUB_OUTPUT: out,
      EXPO_CONNECTED: "true",
    };
    execFileSync(
      "bash",
      [resolve(import.meta.dirname, "../../.github/scripts/platforms.sh")],
      { cwd: dir, env: { ...env, IOS_BUILDS_ENABLED: "false" } },
    );
    assert.match(readFileSync(out, "utf8"), /^ios=false$/m);
    assert.match(readFileSync(out, "utf8"), /^android=true$/m);
    for (const features of [undefined, [], ["faster-ci"]]) {
      writeFileSync(
        join(dir, "disposabl.json"),
        JSON.stringify({ platforms: ["web", "android", "ios"], features }),
      );
      writeFileSync(out, "");
      execFileSync(
        "bash",
        [resolve(import.meta.dirname, "../../.github/scripts/platforms.sh")],
        { cwd: dir, env },
      );
      const selected = Object.fromEntries(
        readFileSync(out, "utf8")
          .trim()
          .split("\n")
          .map((line) => line.split("=")),
      );
      const faster = features?.includes("faster-ci");
      assert.equal(
        selected.android_runner,
        faster ? "blacksmith-8vcpu-ubuntu-2404" : "ubuntu-24.04",
      );
      assert.equal(
        selected.linux_runner,
        faster ? "blacksmith-2vcpu-ubuntu-2404" : "ubuntu-24.04",
      );
      assert.equal(selected.android, "true");
    }
    writeFileSync(out, "");
    execFileSync(
      "bash",
      [resolve(import.meta.dirname, "../../.github/scripts/platforms.sh")],
      { cwd: dir, env: { ...env, IOS_BUILDS_ENABLED: "true" } },
    );
    assert.match(readFileSync(out, "utf8"), /^ios=true$/m);
    writeFileSync(
      join(dir, "bin/gh"),
      '#!/bin/sh\ncase "$*" in *pulls/1/files*) echo .github/scripts/android-runner.sh;; *) exit 1;; esac\n',
      { mode: 0o755 },
    );
    writeFileSync(out, "");
    execFileSync(
      "bash",
      [resolve(import.meta.dirname, "../../.github/scripts/platforms.sh")],
      { cwd: dir, env },
    );
    assert.match(readFileSync(out, "utf8"), /^android=true$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
