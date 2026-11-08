import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

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

test("native warmup requires completed Gradle work, a real result, and enough remaining time", () => {
  const dir = mkdtempSync(join(tmpdir(), "android-prime-"));
  try {
    writeFileSync(
      join(dir, "gradlew"),
      '#!/bin/sh\nprintf "%s\\n" "$*" > "$GRADLE_CALL"\nif [ "$GRADLE_SLEEP" = 1 ]; then sleep 5; fi\nexit "$GRADLE_RESULT"\n',
      { mode: 0o755 },
    );
    writeFileSync(
      join(dir, "ccache"),
      '#!/bin/sh\nif [ "$1" = "--inspect" ]; then echo "Entry type: 0 (result)"; fi\n',
      { mode: 0o755 },
    );
    const script = resolve(
      import.meta.dirname,
      "../../.github/scripts/android-runner.sh",
    );
    const resultFile = join(dir, "testR");
    writeFileSync(resultFile, "cached result fixture");
    const run = (status: number, age: number, sleep = false) =>
      spawnSync("bash", [script, "prime"], {
        cwd: dir,
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          CCACHE_DIR: dir,
          ANDROID_PRIME_STARTED_AT: String(Math.floor(Date.now() / 1000) - age),
          GRADLE_CALL: join(dir, "gradle-call"),
          GRADLE_RESULT: String(status),
          GRADLE_SLEEP: sleep ? "1" : "0",
        },
      });
    const ok = run(0, 100);
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /Native compilation budget: 8[0-9][0-9]s/);
    assert.match(
      readFileSync(join(dir, "gradle-call"), "utf8"),
      /:app:externalNativeBuildRelease/,
    );
    assert.equal(run(124, 100).status, 124);
    const timedOut = run(0, 958, true);
    assert.ok(
      timedOut.status === 124 || timedOut.status === 137,
      `expected timeout failure, got ${timedOut.status}`,
    );
    assert.equal(run(42, 100).status, 42);
    assert.match(run(0, 961).stderr, /Insufficient time remaining/);
    rmSync(resultFile);
    assert.match(run(0, 100).stderr, /No compiler result was cached/);
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
  const prime = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "-e",
        "console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))",
        join(root, ".github/workflows/android-cache-prime.yml"),
      ],
      { encoding: "utf8" },
    ),
  ) as {
    jobs: {
      prime: {
        if: string;
        "timeout-minutes": number;
        env: Record<string, string>;
      };
    };
  };
  assert.equal(prime.jobs.prime.if, "github.ref == 'refs/heads/main'");
  assert.equal(prime.jobs.prime["timeout-minutes"], 20);
  assert.doesNotMatch(
    JSON.stringify(prime.jobs.prime.env),
    /\$\{\{\s*runner\./,
  );
  assert.match(primeText, /CCACHE_DIR=%s\\n.*\$RUNNER_TEMP\/ccache/);
  assert.doesNotMatch(primeText, /secrets\.|id-token|publish|report/i);
  const key =
    "android-ccache-v1-${{ runner.os }}-${{ runner.arch }}-${{ github.sha }}";
  assert.equal(primeText.split(key).length - 1, 2);
  assert.equal(pipelineText.split(key).length - 1, 1);
  assert.match(primeText, /actions\/cache\/save@v4/);
  assert.match(pipelineText, /actions\/cache\/restore@v4/);
  assert.doesNotMatch(primeText + pipelineText, /CCACHE_SLOPPINESS/);
});
