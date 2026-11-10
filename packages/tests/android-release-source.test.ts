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

const scripts = resolve(import.meta.dirname, "../../.github/scripts");
const sha = "a".repeat(40);
const newer = "b".repeat(40);

test("queued product Android source is accepted only while its event commit remains on main", () => {
  const temp = mkdtempSync(join(tmpdir(), "android-source-"));
  try {
    const bin = join(temp, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "git"), '#!/bin/sh\nprintf "%s\\n" "$CHECKOUT"\n', {
      mode: 0o755,
    });
    writeFileSync(
      join(bin, "gh"),
      '#!/bin/sh\ncase "$*" in *compare*) printf "%s\\n" "$COMPARISON";; *) printf "%s\\n" "$CURRENT";; esac\nexit "${GH_EXIT:-0}"\n',
      { mode: 0o755 },
    );
    const env = {
      ...process.env,
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: temp,
      GH_REPO: "disposabl-dev/create-disposabl-app",
      CHANNEL: "production",
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/heads/main",
      GITHUB_SHA: sha,
      SOURCE: sha,
      SOURCE_PATH: "git/ref/heads/main",
      CHECKOUT: sha,
      COMPARISON: "ahead",
      CURRENT: newer,
    };
    const run = (
      patch: NodeJS.ProcessEnv = {},
      platform = "android",
      context = "build",
    ) =>
      spawnSync(
        "/bin/bash",
        [
          "-c",
          'set -euo pipefail; source "$1"; verify_release_source "$2" "$3"',
          "_",
          join(scripts, "release-source.sh"),
          platform,
          context,
        ],
        { cwd: temp, env: { ...env, ...patch }, encoding: "utf8" },
      );
    for (const comparison of ["ahead", "identical"]) {
      assert.equal(run({ COMPARISON: comparison }).status, 0);
      assert.equal(
        run({ COMPARISON: comparison, CHECKOUT: newer }, "android", "publish")
          .status,
        0,
      );
    }
    for (const patch of [
      { COMPARISON: "diverged" },
      { COMPARISON: "behind" },
      { COMPARISON: "" },
      { GH_EXIT: "1" },
      { GITHUB_SHA: newer },
      { CHECKOUT: newer },
      { GITHUB_REF: "refs/heads/other" },
    ])
      assert.notEqual(run(patch).status, 0, JSON.stringify(patch));
    assert.notEqual(run({ GH_REPO: "user/generated-app" }).status, 0);
    assert.equal(
      run({ GH_REPO: "user/generated-app", CURRENT: sha }).status,
      0,
    );
    assert.notEqual(run({}, "ios").status, 0);
    assert.notEqual(
      run({
        CHANNEL: "pr-1",
        GITHUB_EVENT_NAME: "pull_request",
        SOURCE_PATH: "pulls/1",
      }).status,
      0,
    );
    assert.equal(
      run({
        CHANNEL: "pr-1",
        GITHUB_EVENT_NAME: "pull_request",
        SOURCE_PATH: "pulls/1",
        CURRENT: sha,
      }).status,
      0,
    );
    assert.notEqual(
      run({ CURRENT: sha, GH_EXIT: "1", GH_REPO: "user/generated-app" }).status,
      0,
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("Android build, submit and artifact publishing use the shared source guard", () => {
  const mobile = readFileSync(join(scripts, "mobile.sh"), "utf8");
  for (const operation of ["android-build", "android-submit"]) {
    const branch = mobile.split(`  ${operation})`)[1].split(";;")[0];
    assert.match(branch, /verify_release_source android/);
    assert.doesNotMatch(branch, /repos\/\$GH_REPO\/\$SOURCE_PATH/);
  }
  const release = readFileSync(join(scripts, "release.sh"), "utf8");
  assert.match(release, /verify_release_source "\$platform" publish/);
  assert.match(release, /verify_release_source "\$PLATFORM"/);
});
