import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("Android disk preparation only removes unused hosted-runner toolchains", () => {
  const dir = mkdtempSync(join(tmpdir(), "android-runner-"));
  try {
    writeFileSync(
      join(dir, "sudo"),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\n',
      { mode: 0o755 },
    );
    writeFileSync(
      join(dir, "df"),
      '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\n/dev/test 99999999 1 %s 1%% /\\n" "$AVAILABLE"\n',
      { mode: 0o755 },
    );
    const calls = join(dir, "calls");
    writeFileSync(calls, "");
    const run = (operation: string, overrides: Record<string, string> = {}) =>
      spawnSync(
        "bash",
        [
          resolve(
            import.meta.dirname,
            "../../.github/scripts/android-runner.sh",
          ),
          operation,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            CALLS: calls,
            AVAILABLE: "31457280",
            GITHUB_ACTIONS: "true",
            RUNNER_ENVIRONMENT: "github-hosted",
            RUNNER_OS: "Linux",
            ...overrides,
          },
        },
      );
    const otherRunners: Record<string, string>[] = [
      { RUNNER_ENVIRONMENT: "self-hosted" },
      { GITHUB_ACTIONS: "false" },
      { RUNNER_OS: "macOS" },
    ];
    for (const overrides of otherRunners) {
      assert.equal(run("prepare", overrides).status, 0);
      assert.equal(readFileSync(calls, "utf8"), "");
    }
    assert.equal(run("prepare").status, 0);
    assert.equal(
      readFileSync(calls, "utf8"),
      "rm -rf -- /usr/share/dotnet /usr/local/.ghcup /opt/ghc /opt/hostedtoolcache/CodeQL\n",
    );
    assert.equal(run("check").status, 0);
    const low = run("check", { AVAILABLE: "1024" });
    assert.equal(low.status, 1);
    assert.match(low.stderr, /25 GiB free/);
    assert.equal(run("check", { AVAILABLE: "invalid" }).status, 1);
    assert.equal(run("unsupported").status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
