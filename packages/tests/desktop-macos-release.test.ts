import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("macOS signed release verifies before enabling publication and cleans credentials", () => {
  const root = mkdtempSync(join(tmpdir(), "macos-release-test-"));
  try {
    const bin = join(root, "bin");
    mkdirSync(bin);
    mkdirSync(join(root, "dist", "release"), { recursive: true });
    writeFileSync(join(root, "dist", "release", "app.zip"), "fixture");
    writeFileSync(join(root, "dist", "release", "app.dmg"), "fixture");
    const mock = (name: string, body: string) =>
      writeFileSync(join(bin, name), `#!/bin/bash\nset -e\n${body}\n`, {
        mode: 0o755,
      });
    mock("security", 'echo "$1" >> "$CALLS"');
    mock(
      "base64",
      `node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(Buffer.from(s.trim(),"base64")))'`,
    );
    mock("bun", 'echo build >> "$CALLS"');
    mock("ditto", 'mkdir -p "$4/Test.app"');
    mock(
      "hdiutil",
      'if [[ "$1" == attach ]]; then [[ "${FAIL_STAGE:-}" != attach ]] || exit 1; mkdir -p "$5/Test.app"; else [[ "${FAIL_STAGE:-}" != detach ]] || exit 1; rm -rf "$2/Test.app"; echo detach >> "$CALLS"; fi',
    );
    mock(
      "codesign",
      `target="\${@: -1}"
if [[ "$1" == "-dv" ]]; then
  hash=abc123
  if [[ "$target" == */mount/* && "\${FAIL_STAGE:-}" == mismatch ]]; then hash=def456; fi
  printf "Authority=Developer ID Application: Test (ABCDE12345)\\nTeamIdentifier=ABCDE12345\\nCDHash=%s\\n" "$hash" >&2
else
  [[ "\${FAIL_VERIFY:-}" != true ]] || exit 1
  [[ "$target" != */mount/* || "\${FAIL_STAGE:-}" != signature ]] || exit 1
fi`,
    );
    mock(
      "xcrun",
      'echo staple >> "$CALLS"; [[ "${@: -1}" != */mount/* || "${FAIL_STAGE:-}" != staple ]]',
    );
    mock(
      "spctl",
      'echo assess >> "$CALLS"; [[ "${@: -1}" != */mount/* || "${FAIL_STAGE:-}" != assess ]]',
    );
    const config = JSON.stringify({
      certificateBase64: "Y2VydA==",
      certificatePassword: "fixture-password",
      identity: "Developer ID Application: Test (ABCDE12345)",
      teamId: "ABCDE12345",
      apiKeyBase64: "a2V5",
      apiKeyId: "KEY",
      apiIssuer: "ISSUER",
    });
    const script = resolve(
      import.meta.dirname,
      "../../.github/scripts/macos-release.sh",
    );
    const run = (fail: boolean, signingConfig = config, stage = "") => {
      rmSync(join(root, "env"), { force: true });
      return spawnSync("bash", [script], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          RUNNER_TEMP: root,
          GITHUB_ENV: join(root, "env"),
          CALLS: join(root, "calls"),
          MACOS_SIGNING_CONFIG: signingConfig,
          FAIL_VERIFY: String(fail),
          FAIL_STAGE: stage,
        },
      });
    };
    const success = run(false);
    assert.equal(success.status, 0, success.stderr);
    assert.match(
      readFileSync(join(root, "env"), "utf8"),
      /MACOS_NOTARIZE=true\n$/,
    );
    assert.match(readFileSync(join(root, "calls"), "utf8"), /delete-keychain/);
    rmSync(join(root, "env"));
    const failed = run(true);
    assert.notEqual(failed.status, 0);
    assert.equal(
      (failed.stdout + failed.stderr).includes("fixture-password"),
      false,
    );
    assert.doesNotMatch(
      readFileSync(join(root, "env"), "utf8"),
      /MACOS_NOTARIZE=true/,
    );
    assert.equal(
      readFileSync(join(root, "calls"), "utf8").match(/delete-keychain/g)
        ?.length,
      2,
    );
    assert.equal(
      readdirSync(root).some((name) => name.startsWith("macos-signing.")),
      false,
    );
    for (const stage of ["signature", "staple", "assess", "mismatch"]) {
      const invalidDmg = run(false, config, stage);
      assert.notEqual(invalidDmg.status, 0, stage);
      assert.doesNotMatch(
        readFileSync(join(root, "env"), "utf8"),
        /MACOS_NOTARIZE=true/,
      );
      assert.equal(
        readdirSync(root).some((name) => name.startsWith("macos-signing.")),
        false,
      );
    }
    assert.equal(
      readFileSync(join(root, "calls"), "utf8").match(/^detach$/gm)?.length,
      5,
    );
    for (const stage of ["attach", "detach"]) {
      assert.notEqual(run(false, config, stage).status, 0, stage);
      assert.doesNotMatch(
        readFileSync(join(root, "env"), "utf8"),
        /MACOS_NOTARIZE=true/,
      );
      const directories = readdirSync(root).filter((name) =>
        name.startsWith("macos-signing."),
      );
      assert.equal(directories.length, stage === "detach" ? 1 : 0);
      for (const directory of directories) {
        const remaining = join(root, directory);
        assert.equal(
          spawnSync("test", ["-e", join(remaining, "AuthKey.p8")]).status,
          1,
        );
        assert.equal(
          spawnSync("test", ["-e", join(remaining, "certificate.p12")]).status,
          1,
        );
        // This is a mock directory, not a real mounted volume.
        rmSync(remaining, { recursive: true });
      }
    }
    const incomplete = run(false, JSON.stringify({ identity: "incomplete" }));
    assert.notEqual(incomplete.status, 0);
    assert.equal(spawnSync("test", ["-e", join(root, "env")]).status, 1);
    const unsigned = run(false, "");
    assert.equal(unsigned.status, 0, unsigned.stderr);
    assert.equal(spawnSync("test", ["-e", join(root, "env")]).status, 1);
    const leftover = join(root, "macos-signing.12345678");
    const otherJob = join(root, "macos-signing.87654321");
    mkdirSync(leftover);
    mkdirSync(otherJob);
    writeFileSync(join(leftover, "AuthKey.p8"), "fixture");
    const cleanup = spawnSync("bash", [script, "cleanup"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: root,
        MACOS_SIGNING_DIRECTORY: leftover,
        CALLS: join(root, "calls"),
      },
    });
    assert.equal(cleanup.status, 0, cleanup.stderr);
    assert.equal(spawnSync("test", ["-e", leftover]).status, 1);
    assert.equal(spawnSync("test", ["-d", otherJob]).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("macOS workflow publishes only verified signed artifacts", () => {
  const parsed = spawnSync(
    process.execPath,
    [
      "-e",
      "console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))",
    ],
    {
      input: readFileSync(
        resolve(import.meta.dirname, "../../.github/workflows/pipeline.yml"),
        "utf8",
      ),
      encoding: "utf8",
    },
  );
  assert.equal(parsed.status, 0, parsed.stderr);
  const workflow = JSON.parse(parsed.stdout);
  const steps = workflow.jobs.desktop.steps as Array<Record<string, any>>;
  const find = (name: string) => steps.find((step) => step.name === name);
  assert.equal(
    find("Build macOS")?.run,
    "bash .github/scripts/macos-release.sh",
  );
  assert.match(
    find("Upload desktop release artifacts")?.if,
    /MACOS_NOTARIZE == 'true'/,
  );
  assert.match(
    find("Upload unsigned macOS artifact")?.if,
    /MACOS_NOTARIZE != 'true'/,
  );
  assert.match(
    find("Publish desktop update feed")?.if,
    /MACOS_NOTARIZE == 'true'/,
  );
  assert.match(find("Clean up macOS signing")?.if, /always\(\)/);
  const script = readFileSync(
    resolve(import.meta.dirname, "../../.github/scripts/release.sh"),
    "utf8",
  );
  assert.match(script, /for platform in android linux windows macos/);
});
