import { test, expect } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const yaml = createRequire(import.meta.url)("js-yaml");
const workflow = yaml.load(
  readFileSync(
    resolve(import.meta.dir, "../../../.github/workflows/publish.yml"),
    "utf8",
  ),
);
const steps = workflow.jobs.cli.steps;
const step = (name: string) =>
  steps.find((s: { name?: string }) => s.name === name).run as string;

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "cli-release-test-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  git(
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.test",
    "commit",
    "--allow-empty",
    "-qm",
    "base",
  );
  git("tag", "@disposabl/cli@1.0.0");
  git(
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.test",
    "commit",
    "--allow-empty",
    "-qm",
    "next",
  );
  const script = (name: string, content: string) =>
    writeFileSync(join(bin, name), `#!/bin/bash\n${content}\n`, {
      mode: 0o755,
    });
  script(
    "npm",
    `case "$1" in view) [[ "\${NPM_FAIL:-}" != 1 ]] || exit 1; echo "\${LATEST:-1.0.0}";; version) :;; pack) echo '[{"name":"@disposabl/cli","version":"'"$VERSION"'","filename":"package.tgz","integrity":"sha512-test","files":[{"path":"dist/index.js"}]}]';; publish) echo publish >> "$RUNNER_TEMP/published";; *) exit 1;; esac`,
  );
  script(
    "curl",
    `[[ "\${CURL_FAIL:-}" != 1 ]] || exit 7; printf '{"name":"@disposabl/cli","version":"%s","dist":{"integrity":"%s"}}' "\${REGISTRY_VERSION:-$VERSION}" "\${INTEGRITY:-sha512-test}" > "$3"; printf '%s' "\${STATUS:-404}"`,
  );
  script("bun", "exit 0");
  const run = (name: string, env: Record<string, string> = {}) =>
    spawnSync("bash", ["-c", step(name)], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: dir,
        VERSION: "1.1.0",
        GENERATOR_RECOVERY: "",
        ...env,
      },
    });
  return { dir, git, run };
}

test("missing newer tagged CLI blocks generator with exact recovery instruction", () => {
  const f = fixture();
  f.git("tag", "@disposabl/cli@1.1.0");
  const r = f.run("Verify CLI release and tag");
  expect(r.status).not.toBe(0);
  expect(r.stdout).toContain("cli_recovery_version=1.1.0");
});

test("recovery publishes only a 404 and safely replays a matching version", () => {
  const f = fixture();
  f.git("tag", "@disposabl/cli@1.1.0");
  expect(f.run("Verify CLI recovery tag").status).toBe(0);
  expect(f.run("Recover tagged CLI release").status).toBe(0);
  expect(readFileSync(join(f.dir, "published"), "utf8")).toBe("publish\n");
  const replay = f.run("Recover tagged CLI release", {
    STATUS: "200",
    LATEST: "1.1.0",
  });
  expect(replay.status).toBe(0);
  expect(replay.stdout).toContain("already exists");
  expect(readFileSync(join(f.dir, "published"), "utf8")).toBe("publish\n");
  expect(
    f.run("Recover tagged CLI release", {
      STATUS: "200",
      INTEGRITY: "sha512-wrong",
    }).status,
  ).not.toBe(0);
});

test("rejects wrong, non-ancestor, and older recovery tags", () => {
  const f = fixture();
  f.git("tag", "@disposabl/cli@1.1.0");
  expect(
    f.run("Verify CLI recovery tag", { VERSION: "2.0.0" }).status,
  ).not.toBe(0);
  expect(
    f.run("Verify CLI recovery tag", { VERSION: "1.0.0" }).status,
  ).not.toBe(0);
  f.git("checkout", "-qb", "other");
  f.git(
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.test",
    "commit",
    "--allow-empty",
    "-qm",
    "other",
  );
  f.git("tag", "@disposabl/cli@2.0.0");
  f.git("checkout", "-q", "-");
  expect(
    f.run("Verify CLI recovery tag", { VERSION: "2.0.0" }).status,
  ).not.toBe(0);
});

test("network, registry, and dist-tag failures do not publish", () => {
  const f = fixture();
  f.git("tag", "@disposabl/cli@1.1.0");
  for (const env of [
    { NPM_FAIL: "1" },
    { CURL_FAIL: "1" },
    { STATUS: "401" },
    { STATUS: "500" },
    { LATEST: "2.0.0" },
  ]) {
    expect(f.run("Recover tagged CLI release", env).status).not.toBe(0);
  }
  expect(
    f.run("Verify CLI release and tag", {
      STATUS: "200",
      REGISTRY_VERSION: "1.1.0",
    }).status,
  ).not.toBe(0);
  expect(workflow.jobs.publish.needs).toBe("cli");
  expect(workflow.jobs.publish.if).toContain("needs.cli.result == 'success'");
  expect(workflow.jobs.publish.if).toContain(
    "inputs.cli_recovery_version == ''",
  );
  expect(workflow.jobs.publish.if).toContain("inputs.recovery_version != ''");
  expect(
    steps.filter(
      (s: { name?: string }) => s.name === "Verify CLI release and tag",
    ),
  ).toHaveLength(2);
  expect(workflow.env.DISPOSABL_CLI_TELEMETRY_REQUIRED).toBe("1");
  expect(workflow.env.DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN).toContain(
    "vars.DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN",
  );
});
