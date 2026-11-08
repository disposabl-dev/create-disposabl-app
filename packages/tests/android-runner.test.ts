import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("Android build diagnostics preserve Gradle arguments and failure status", () => {
  const dir = mkdtempSync(join(tmpdir(), "android-build-"));
  try {
    writeFileSync(
      join(dir, "gradlew"),
      '#!/bin/sh\nwhile [ ! -f "$SAMPLER_PID" ]; do sleep 0.01; done\nprintf "%s\\n" "$*"\nexit "$GRADLE_RESULT"\n',
      { mode: 0o755 },
    );
    writeFileSync(
      join(dir, "vmstat"),
      '#!/bin/sh\necho $$ > "$SAMPLER_PID"\nexec sleep 30\n',
      {
        mode: 0o755,
      },
    );
    for (const status of [0, 42]) {
      const samplerPid = join(dir, `sampler-${status}`);
      const result = spawnSync(
        "bash",
        [
          resolve(
            import.meta.dirname,
            "../../.github/scripts/android-runner.sh",
          ),
          "build",
        ],
        {
          cwd: dir,
          encoding: "utf8",
          timeout: 5000,
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            RUNNER_OS: "Linux",
            GRADLE_RESULT: String(status),
            SAMPLER_PID: samplerPid,
          },
        },
      );
      assert.equal(result.status, status, result.stderr);
      assert.match(
        result.stdout,
        /:app:assembleRelease --no-daemon --build-cache/,
      );
      assert.match(result.stdout, /Android runner processors: \d+/);
      assert.match(result.stderr, /Gradle elapsed:/);
      assert.throws(
        () => process.kill(Number(readFileSync(samplerPid, "utf8")), 0),
        { code: "ESRCH" },
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Android disk preparation only removes unused hosted-runner toolchains", () => {
  const dir = mkdtempSync(join(tmpdir(), "android-runner-"));
  try {
    writeFileSync(
      join(dir, "sudo"),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\n',
      { mode: 0o755 },
    );
    writeFileSync(join(dir, "du"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
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
      { RUNNER_ENVIRONMENT: "" },
      { GITHUB_ACTIONS: "" },
      { RUNNER_OS: "" },
    ];
    for (const overrides of otherRunners) {
      assert.equal(run("prepare", overrides).status, 0);
      assert.equal(readFileSync(calls, "utf8"), "");
    }
    assert.equal(run("prepare").status, 0);
    assert.equal(readFileSync(calls, "utf8"), "");
    assert.equal(run("prepare", { AVAILABLE: "1024" }).status, 0);
    assert.equal(
      readFileSync(calls, "utf8"),
      "rm -rf -- /usr/share/dotnet /usr/local/.ghcup /opt/ghc /opt/hostedtoolcache/CodeQL /usr/share/swift /usr/share/miniconda /opt/microsoft/powershell /usr/local/share/powershell /usr/local/share/vcpkg /home/linuxbrew\n",
    );
    assert.equal(run("check").status, 0);
    assert.equal(run("check", { AVAILABLE: "26214400" }).status, 0);
    assert.equal(run("check", { AVAILABLE: "26214399" }).status, 1);
    const low = run("check", { AVAILABLE: "1024" });
    assert.equal(low.status, 1);
    assert.match(low.stderr, /25 GiB free/);
    assert.equal(run("check", { AVAILABLE: "invalid" }).status, 1);
    assert.equal(run("unsupported").status, 1);
    writeFileSync(join(dir, "sudo"), "#!/bin/sh\nexit 42\n", { mode: 0o755 });
    assert.equal(run("prepare", { AVAILABLE: "1024" }).status, 42);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("native cache warmup saves completed work after its budget but rejects real failures", () => {
  const dir = mkdtempSync(join(tmpdir(), "android-prime-"));
  try {
    writeFileSync(
      join(dir, "timeout"),
      '#!/bin/sh\nprintf "%s\\n" "$*"\nexit "$TIMEOUT_RESULT"\n',
      { mode: 0o755 },
    );
    writeFileSync(
      join(dir, "ccache"),
      '#!/bin/sh\nif [ "$1" = "--print-stats" ]; then printf "cache_miss\\t%s\\n" "$CACHE_MISSES"; fi\n',
      { mode: 0o755 },
    );
    const script = resolve(
      import.meta.dirname,
      "../../.github/scripts/android-runner.sh",
    );
    const run = (status: number, misses: number) =>
      spawnSync("bash", [script, "prime"], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          TIMEOUT_RESULT: String(status),
          CACHE_MISSES: String(misses),
        },
      });
    for (const status of [0, 124]) {
      const result = run(status, 10);
      assert.equal(result.status, 0, result.stderr);
      assert.match(
        result.stdout,
        /--signal=INT --kill-after=15s 16m .*:app:externalNativeBuildRelease/,
      );
    }
    assert.equal(run(42, 10).status, 42);
    assert.equal(run(0, 0).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("native warmup and production use the same exact-commit cache", () => {
  const root = resolve(import.meta.dirname, "../..");
  const primeText = readFileSync(
    join(root, ".github/workflows/android-cache-prime.yml"),
    "utf8",
  );
  const pipelineText = readFileSync(
    join(root, ".github/workflows/pipeline.yml"),
    "utf8",
  );
  const prime = Bun.YAML.parse(primeText) as {
    jobs: { prime: { if: string; "timeout-minutes": number } };
  };
  assert.equal(prime.jobs.prime.if, "github.ref == 'refs/heads/main'");
  assert.equal(prime.jobs.prime["timeout-minutes"], 20);
  assert.doesNotMatch(primeText, /secrets\.|id-token|publish|report/i);
  const key =
    "android-ccache-v1-${{ runner.os }}-${{ runner.arch }}-${{ github.sha }}";
  assert.equal(primeText.split(key).length - 1, 2);
  assert.equal(pipelineText.split(key).length - 1, 1);
  assert.match(primeText, /actions\/cache\/save@v4/);
  assert.match(pipelineText, /actions\/cache\/restore@v4/);
  assert.doesNotMatch(primeText + pipelineText, /CCACHE_SLOPPINESS/);
});
