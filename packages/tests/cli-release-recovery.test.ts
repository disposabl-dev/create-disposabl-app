import { test } from "node:test";
// @ts-expect-error bun:test is not included in this workspace's Node type set.
import { expect } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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
const step = (name: string, job = "cli") =>
  workflow.jobs[job].steps.find((s: { name?: string }) => s.name === name)
    .run as string;

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
  const guard = "packages/disposabl-kit/server/release/verify-metadata.mjs";
  mkdirSync(join(dir, "packages/disposabl-kit/server/release"), {
    recursive: true,
  });
  writeFileSync(
    join(dir, guard),
    readFileSync(
      resolve(
        import.meta.dirname,
        "..",
        "disposabl-kit/server/release/verify-metadata.mjs",
      ),
    ),
  );
  git("add", guard);
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
    `case "$1" in
      view) [[ "\${NPM_FAIL:-}" != 1 ]] || exit 1; echo "\${LATEST:-1.0.0}";;
      version) :;;
      pack)
        mkdir -p "$RUNNER_TEMP/pack-source/dist"
        node -e 'const fs=require("node:fs"); const d=process.env; let m={name:d.PACKAGE_NAME || "@disposabl/cli",version:d.VERSION,repository:{type:"git",url:"https://github.com/example/app"}}; if(d.PACK_CASE==="userinfo") m.repository.url="https://user:synthetic-secret@example.test/repo"; if(d.PACK_CASE==="query") m.homepage="https://example.test/?token=synthetic-secret"; if(d.PACK_CASE==="invalid") m.bugs={url:"https://synthetic-secret@"}; if(d.PACK_CASE==="whitespace") m.homepage=" https://user:synthetic-secret@example.test/"; if(d.PACK_CASE==="key") m.repository={"synthetic-secret":"https://user:synthetic-secret@example.test/"}; if(d.PACK_CASE==="single-slash") m.homepage="https:/example.test/?token=synthetic-secret"; if(d.PACK_CASE==="backslash") m.homepage="https:"+String.fromCharCode(92)+"user:synthetic-secret@example.test/repo"; fs.writeFileSync(d.RUNNER_TEMP+"/pack-source/package.json",JSON.stringify(m)); fs.writeFileSync(d.RUNNER_TEMP+"/pack-source/dist/index.js","// fixture");'
        "$REAL_NPM" pack "$RUNNER_TEMP/pack-source" --json --ignore-scripts --pack-destination "$PWD" > "$RUNNER_TEMP/real-pack.json" || exit 1
        node -e 'const p=require(process.argv[1]);p[0].integrity="sha512-test";process.stdout.write(JSON.stringify(p))' "$RUNNER_TEMP/real-pack.json";;
      publish)
        node -e 'const fs=require("node:fs"); const p=require(process.env.RUNNER_TEMP+"/real-pack.json")[0]; if(process.argv[1]!==p.filename || !fs.existsSync(process.argv[1])) process.exit(1)' "$2" || exit 1
        echo publish >> "$RUNNER_TEMP/published";; *) exit 1;; esac`,
  );
  script(
    "curl",
    `[[ "\${CURL_FAIL:-}" != 1 ]] || exit 7; printf '{"name":"%s","version":"%s","dist":{"integrity":"%s"}}' "\${PACKAGE_NAME:-@disposabl/cli}" "\${REGISTRY_VERSION:-$VERSION}" "\${INTEGRITY:-sha512-test}" > "$3"; printf '%s' "\${STATUS:-404}"`,
  );
  script("gh", "exit 0");
  script("bun", "exit 0");
  const run = (
    name: string,
    env: Record<string, string | undefined> = {},
    job = "cli",
  ) =>
    spawnSync("bash", ["-c", step(name, job)], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: dir,
        GITHUB_WORKSPACE: dir,
        REAL_NPM: execFileSync("which", ["npm"], { encoding: "utf8" }).trim(),
        npm_config_userconfig: join(dir, "empty-npmrc"),
        VERSION: "1.1.0",
        GENERATOR_RECOVERY: "",
        ...env,
      },
    });
  expect(run("Preserve recovery metadata guard").status).toBe(0);
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

test(
  "historical recovery checks packed metadata before either package publishes",
  { timeout: 30000 },
  () => {
    for (const [job, recovery, packageName] of [
      ["cli", "Recover tagged CLI release", "@disposabl/cli"],
      ["publish", "Recover tagged release", "create-disposabl-app"],
    ]) {
      const f = fixture();
      const order = workflow.jobs[job].steps.map(
        (s: { name?: string }) => s.name,
      );
      expect(order.indexOf("Preserve recovery metadata guard")).toBeLessThan(
        order.indexOf(
          job === "cli" ? "Verify CLI recovery tag" : "Verify recovery tag",
        ),
      );
      f.git("tag", job === "cli" ? "@disposabl/cli@1.1.0" : "v1.1.0", "HEAD~1");
      expect(f.run("Preserve recovery metadata guard", {}, job).status).toBe(0);
      expect(
        f.run(
          job === "cli" ? "Verify CLI recovery tag" : "Verify recovery tag",
          {},
          job,
        ).status,
      ).toBe(0);
      expect(
        existsSync(
          join(
            f.dir,
            "packages/disposabl-kit/server/release/verify-metadata.mjs",
          ),
        ),
      ).toBe(false);
      for (const packCase of [
        "userinfo",
        "query",
        "invalid",
        "whitespace",
        "key",
        "single-slash",
        "backslash",
      ]) {
        const result = f.run(
          recovery,
          { PACKAGE_NAME: packageName, PACK_CASE: packCase },
          job,
        );
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("URL in package metadata");
        expect(result.stdout + result.stderr).not.toContain("synthetic-secret");
        expect(() => readFileSync(join(f.dir, "published"))).toThrow();
      }
      expect(f.run(recovery, { PACKAGE_NAME: packageName }, job).status).toBe(
        0,
      );
      expect(readFileSync(join(f.dir, "published"), "utf8")).toBe("publish\n");
    }
  },
);

test("generator recovery retains registry and version gates", () => {
  const f = fixture();
  const args = { PACKAGE_NAME: "create-disposabl-app" };
  expect(
    f.run("Recover tagged release", { ...args, STATUS: "200" }, "publish")
      .status,
  ).toBe(0);
  for (const override of [
    { STATUS: "401" },
    { STATUS: "500" },
    { CURL_FAIL: "1" },
    { NPM_FAIL: "1" },
    { LATEST: "2.0.0" },
  ])
    expect(
      f.run("Recover tagged release", { ...args, ...override }, "publish")
        .status,
    ).not.toBe(0);
  expect(existsSync(join(f.dir, "published"))).toBe(false);
});

test("metadata guard runs through symlinks and redacts malformed JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "metadata-guard-link-"));
  const original = resolve(
    import.meta.dirname,
    "../disposabl-kit/server/release/verify-metadata.mjs",
  );
  const alias = join(dir, "guard.mjs");
  const input = join(dir, "package.json");
  symlinkSync(original, alias);
  for (const [contents, diagnostic] of [
    [
      '{"homepage":"https://synthetic-secret@"}',
      "Invalid URL in package metadata",
    ],
    ['{"homepage":"synthetic-secret', "Invalid package metadata JSON"],
  ]) {
    writeFileSync(input, contents);
    const result = spawnSync("node", [alias, input], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(diagnostic);
    expect(result.stdout + result.stderr).not.toContain("synthetic-secret");
  }
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
    for (const name of ["cli", "sdk", "create-disposabl-app"]) {
      const folder = join(dir, "packages", name);
      mkdirSync(join(folder, "dist"), { recursive: true });
      writeFileSync(join(folder, "dist/index.js"), "// fixture\n");
      writeFileSync(
        join(folder, "dist/verify-metadata.mjs"),
        readFileSync(
          join(
            root,
            "packages/disposabl-kit/server/release/verify-metadata.mjs",
          ),
        ),
      );
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
      const pack = (cwd = folder) =>
        spawnSync("npm", ["pack", "--json", "--pack-destination", dir], {
          cwd,
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
      const extracted = join(dir, `extracted-${name}`);
      mkdirSync(extracted);
      execFileSync("tar", ["-xf", archive, "-C", extracted]);
      expect(pack(join(extracted, "package")).status).toBe(0);
      writeFileSync(
        join(extracted, "package/package.json"),
        JSON.stringify({ ...packed, homepage: "https://synthetic-secret@" }),
      );
      const invalidRepack = pack(join(extracted, "package"));
      expect(invalidRepack.status).not.toBe(0);
      expect(invalidRepack.stderr).toContain("Invalid URL in package metadata");
      expect(invalidRepack.stderr).not.toContain("synthetic-secret");
      for (const [field, value] of [
        [
          "repository",
          {
            type: "git",
            url: "https://user:synthetic-secret@example.test/repo",
          },
        ],
        ["homepage", "https://example.test/?token=synthetic-secret"],
        ["homepage", " https://user:synthetic-secret@example.test/ "],
        ["homepage", "https:/example.test/?token=synthetic-secret"],
        ["homepage", "//user:synthetic-secret@example.test/"],
        [
          "homepage",
          "https:" +
            String.fromCharCode(92) +
            "user:synthetic-secret@example.test/repo",
        ],
        ["homepage", "\u0000ht\ttps://user:synthetic-secret@example.test/"],
        [
          "repository",
          {
            "synthetic-secret":
              " Git+https://user:synthetic-secret@example.test/",
          },
        ],
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
