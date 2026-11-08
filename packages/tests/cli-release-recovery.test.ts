import { test } from "node:test";
// @ts-expect-error bun:test is not included in this workspace's Node type set.
import { expect } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const workflow = JSON.parse(
  execFileSync(
    process.execPath,
    [
      "-e",
      "console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))",
    ],
    {
      input: readFileSync(
        resolve(import.meta.dirname, "../../.github/workflows/publish.yml"),
      ),
      encoding: "utf8",
    },
  ),
);
const steps = workflow.jobs.cli.steps;
const step = (name: string) =>
  steps.find((s: { name?: string }) => s.name === name).run as string;

test("conflicting recovery inputs run validation and fail visibly", () => {
  const shouldRun = new Function(
    "github",
    "inputs",
    `return ${workflow.jobs.cli.if}`,
  );
  const github = {
    repository: "disposabl-dev/create-disposabl-app",
    ref: "refs/heads/main",
  };
  expect(
    shouldRun(github, { recovery_version: "", cli_recovery_version: "" }),
  ).toBe(true);
  expect(
    shouldRun(github, { recovery_version: "0.15.0", cli_recovery_version: "" }),
  ).toBe(false);
  expect(
    shouldRun(github, { recovery_version: "", cli_recovery_version: "1.1.0" }),
  ).toBe(true);
  expect(
    shouldRun(github, {
      recovery_version: "0.15.0",
      cli_recovery_version: "1.1.0",
    }),
  ).toBe(true);
  const result = fixture().run("Verify CLI recovery tag", {
    GENERATOR_RECOVERY: "0.15.0",
  });
  expect(result.status).not.toBe(0);
  expect(result.stdout).toContain("Select only one recovery.");
});

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
  const run = (name: string, env: Record<string, string | undefined> = {}) =>
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

test(
  "release metadata excludes synthetic Git credentials in actual npm packs",
  { timeout: 30000 },
  async () => {
    const { publicRepositoryUrl, verifyConditions } =
      // @ts-expect-error The release plugin is plain JavaScript.
      await import("../disposabl-kit/server/release/clients.mjs");
    for (const original of [
      "git@github.com:example/app.git",
      "ssh://git@github.com/example/app.git",
      "https://user:synthetic-secret@github.com/example/app.git?token=synthetic-secret",
    ])
      expect(publicRepositoryUrl(original)).toBe(
        "git+https://github.com/example/app.git",
      );
    try {
      publicRepositoryUrl("https://synthetic-secret@");
      throw new Error("Expected invalid repository URL to be rejected");
    } catch (error) {
      expect(String(error)).toBe("Error: Invalid repository URL");
      expect(JSON.stringify(error)).not.toContain("synthetic-secret");
    }
    const dir = mkdtempSync(join(tmpdir(), "release-metadata-"));
    const root = resolve(import.meta.dirname, "../..");
    const helper = join(dir, "packages/disposabl-kit/server/release");
    mkdirSync(helper, { recursive: true });
    writeFileSync(
      join(helper, "verify-metadata.mjs"),
      readFileSync(
        join(root, "packages/disposabl-kit/server/release/verify-metadata.mjs"),
      ),
    );
    for (const name of ["cli", "sdk", "create-disposabl-app"]) {
      const folder = join(dir, "packages", name);
      mkdirSync(join(folder, "dist"), { recursive: true });
      writeFileSync(join(folder, "dist/index.js"), "// fixture\n");
      const manifest = JSON.parse(
        readFileSync(join(root, "packages", name, "package.json"), "utf8"),
      );
      writeFileSync(join(folder, "package.json"), JSON.stringify(manifest));
      if (name !== "create-disposabl-app") {
        verifyConditions(
          {},
          {
            cwd: folder,
            options: {
              repositoryUrl:
                "https://synthetic-user:synthetic-secret@github.com/example/app.git?token=synthetic-secret",
              originalRepositoryURL: "git+https://github.com/example/app.git",
            },
          },
        );
      }
      const pack = () =>
        spawnSync("npm", ["pack", "--json", "--pack-destination", dir], {
          cwd: folder,
          encoding: "utf8",
          env: {
            PATH: process.env.PATH,
            NODE_ENV: "test",
            HOME: dir,
            npm_config_userconfig: join(dir, "empty-npmrc"),
          },
        });
      let result = pack();
      expect(result.status).toBe(0);
      const archive = join(dir, JSON.parse(result.stdout)[0].filename);
      const packed = JSON.parse(
        execFileSync("tar", ["-xOf", archive, "package/package.json"], {
          encoding: "utf8",
        }),
      );
      expect(JSON.stringify(packed)).not.toContain("synthetic-secret");
      expect(packed.repository.url).not.toContain("@");
      for (const [field, value] of [
        [
          "repository",
          {
            type: "git",
            url: "https://user:synthetic-secret@example.test/repo",
          },
        ],
        ["homepage", "https://example.test/?token=synthetic-secret"],
        ["bugs", { url: "https://example.test/#synthetic-secret" }],
        ["funding", { url: "https://user:synthetic-secret@example.test/" }],
      ]) {
        const unsafe = { ...packed, [field as string]: value };
        writeFileSync(join(folder, "package.json"), JSON.stringify(unsafe));
        result = pack();
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("Unsafe URL in package metadata");
        expect(result.stderr).not.toContain("synthetic-secret");
      }
      writeFileSync(
        join(folder, "package.json"),
        JSON.stringify({ ...packed, homepage: "https://synthetic-secret@" }),
      );
      result = pack();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Invalid URL in package metadata");
      expect(result.stderr).not.toContain("synthetic-secret");
    }
  },
);
