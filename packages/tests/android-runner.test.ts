import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

test("installed SDK is used only after the hosted image accepts its licenses", () => {
  const dir = mkdtempSync(join(tmpdir(), "android-sdk-"));
  try {
    mkdirSync(join(dir, "cmdline-tools/latest/bin"), { recursive: true });
    mkdirSync(join(dir, "platform-tools"));
    writeFileSync(join(dir, "platform-tools/adb"), "#!/bin/sh\n", {
      mode: 0o755,
    });
    writeFileSync(
      join(dir, "cmdline-tools/latest/bin/sdkmanager"),
      '#!/bin/sh\ntest "$1" = --licenses && read accept && test "$accept" = y || exit 1\necho "$FIXTURE_LICENSES"\nexit "$FIXTURE_STATUS"\n',
      { mode: 0o755 },
    );
    const script = resolve(
      import.meta.dirname,
      "../../.github/scripts/android-runner.sh",
    );
    const output = join(dir, "output");
    for (const [runner, status, licenses, expected] of [
      [
        "github-hosted",
        "0",
        "All SDK package licenses accepted",
        "ready=true\n",
      ],
      ["github-hosted", "1", "", ""],
      ["github-hosted", "0", "License not accepted", ""],
      ["self-hosted", "0", "All SDK package licenses accepted", ""],
    ]) {
      writeFileSync(output, "");
      execFileSync("bash", [script, "sdk"], {
        env: {
          ...process.env,
          ANDROID_HOME: dir,
          RUNNER_ENVIRONMENT: runner,
          GITHUB_OUTPUT: output,
          FIXTURE_STATUS: status,
          FIXTURE_LICENSES: licenses,
        },
      });
      assert.equal(readFileSync(output, "utf8"), expected);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

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
          ":app:assembleRelease",
          ":app:bundleRelease",
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
        /:app:assembleRelease :app:bundleRelease --no-daemon --build-cache/,
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

test("native warmup shares release cache keys and PRs only seed a missing cache", () => {
  const root = resolve(import.meta.dirname, "../..");
  const primeText = readFileSync(
    join(root, ".github/workflows/android-cache-prime.yml"),
    "utf8",
  );
  const pipelineText = readFileSync(
    join(root, ".github/workflows/pipeline.yml"),
    "utf8",
  );
  const parseWorkflow = (source: string) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "-e",
          "console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))",
        ],
        { encoding: "utf8", input: source },
      ),
    ) as {
      jobs: Record<
        string,
        {
          if: string;
          "timeout-minutes": number;
          env: Record<string, string>;
          steps: {
            name?: string;
            if?: string;
            uses?: string;
            with?: Record<string, string>;
          }[];
        }
      >;
    };
  const prime = parseWorkflow(primeText);
  const android = parseWorkflow(pipelineText).jobs.android;
  assert.equal(prime.jobs.prime.if, "github.ref == 'refs/heads/main'");
  assert.equal(prime.jobs.prime["timeout-minutes"], 20);
  assert.doesNotMatch(
    JSON.stringify(prime.jobs.prime.env),
    /\$\{\{\s*runner\./,
  );
  assert.match(primeText, /CCACHE_DIR=%s\\n.*\$RUNNER_TEMP\/ccache/);
  assert.doesNotMatch(primeText, /secrets\.|id-token|publish|report/i);
  const prefix =
    "android-ccache-v2-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('bun.lock', 'apps/mobile/app.json', 'apps/mobile/scripts/**') }}-";
  assert.equal(primeText.split(prefix + "${{ github.sha }}").length - 1, 2);
  const restore = android.steps.find(
    (step) => step.name === "Restore native compiler cache",
  );
  assert.equal(restore?.with?.key, prefix + "${{ env.SOURCE }}");
  assert.equal(restore?.with?.["restore-keys"], prefix);
  const save = android.steps.find(
    (step) => step.name === "Save native compiler cache",
  );
  assert.match(save?.if ?? "", /steps\.build\.outcome == 'success'/);
  assert.match(
    save?.if ?? "",
    /steps\.native-compiler\.outputs\.enabled == 'true'/,
  );
  assert.match(
    save?.if ?? "",
    /github\.event_name == 'push' && .*cache-hit != 'true'/,
  );
  assert.match(
    save?.if ?? "",
    /github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.repo\.full_name == github\.repository\s+&&\s+steps\.native-cache\.outputs\.cache-matched-key == ''/,
  );
  assert.match(primeText, /actions\/cache\/save@v6/);
  assert.match(pipelineText, /actions\/cache\/restore@v6/);
  assert.doesNotMatch(primeText + pipelineText, /CCACHE_SLOPPINESS/);
});
