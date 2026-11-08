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
      "codesign",
      'if [[ "$1" == "-dv" ]]; then printf "Authority=Developer ID Application: Test (ABCDE12345)\\nTeamIdentifier=ABCDE12345\\n" >&2; else [[ "${FAIL_VERIFY:-}" != true ]]; fi',
    );
    mock("xcrun", 'echo staple >> "$CALLS"');
    mock("spctl", 'echo assess >> "$CALLS"');
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
    const run = (fail: boolean, signingConfig = config) =>
      spawnSync("bash", [script], {
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
        },
      });
    const success = run(false);
    assert.equal(success.status, 0, success.stderr);
    assert.equal(
      readFileSync(join(root, "env"), "utf8"),
      "MACOS_NOTARIZE=true\n",
    );
    assert.match(readFileSync(join(root, "calls"), "utf8"), /delete-keychain/);
    rmSync(join(root, "env"));
    const failed = run(true);
    assert.notEqual(failed.status, 0);
    assert.equal(
      (failed.stdout + failed.stderr).includes("fixture-password"),
      false,
    );
    assert.equal(spawnSync("test", ["-e", join(root, "env")]).status, 1);
    assert.equal(
      readFileSync(join(root, "calls"), "utf8").match(/delete-keychain/g)
        ?.length,
      2,
    );
    assert.equal(
      readdirSync(root).some((name) => name.startsWith("macos-signing.")),
      false,
    );
    const incomplete = run(false, JSON.stringify({ identity: "incomplete" }));
    assert.notEqual(incomplete.status, 0);
    assert.equal(spawnSync("test", ["-e", join(root, "env")]).status, 1);
    const unsigned = run(false, "");
    assert.equal(unsigned.status, 0, unsigned.stderr);
    assert.equal(spawnSync("test", ["-e", join(root, "env")]).status, 1);
    const leftover = join(root, "macos-signing.12345678");
    mkdirSync(leftover);
    writeFileSync(join(leftover, "AuthKey.p8"), "fixture");
    const cleanup = spawnSync("bash", [script, "cleanup"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: root,
        CALLS: join(root, "calls"),
      },
    });
    assert.equal(cleanup.status, 0, cleanup.stderr);
    assert.equal(spawnSync("test", ["-e", leftover]).status, 1);
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
