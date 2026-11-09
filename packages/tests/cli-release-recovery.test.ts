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

test("verification budget leaves time for release work", () => {
  const maximumVerificationSeconds = 25 * 2 * 10 + 24 * 20;
  for (const job of ["cli", "publish"]) {
    expect(workflow.jobs[job]["timeout-minutes"]).toBe(30);
    expect(
      workflow.jobs[job]["timeout-minutes"] * 60 - maximumVerificationSeconds,
    ).toBe(820);
  }
});

test("conflicting recovery inputs run validation and fail visibly", () => {
  const f = fixture();
  const result = f.run(
    "Resolve release source",
    {
      CLI_RECOVERY: "1.1.0",
      GENERATOR_RECOVERY: "0.15.0",
    },
    "resolve",
  );
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
  for (const path of [
    ".github/scripts/product-browser-check.py",
    ".github/scripts/product-browser-check-test.py",
    "packages/tests/helpers/sdk-auth/run.py",
    "packages/tests/helpers/sdk-auth/selected_auth.py",
  ]) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), "# inert harness fixture\n");
    git("add", path);
  }
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
    `[[ "\${CURL_FAIL:-}" != 1 ]] || exit 7
    if [[ -z "\${VERIFY_MODE:-}" ]]; then
      printf '{"name":"%s","version":"%s","dist":{"integrity":"%s"}}' "\${PACKAGE_NAME:-@disposabl/cli}" "\${REGISTRY_VERSION:-$VERSION}" "\${INTEGRITY:-sha512-test}" > "$3"; printf '%s' "\${STATUS:-404}"; exit
    fi
    [[ "$*" == *'Cache-Control: no-cache'* ]] || exit 22
    output=''; url=''; previous=''
    for arg in "$@"; do
      [[ "$previous" != -o ]] || output="$arg"
      [[ "$arg" != https://* ]] || url="$arg"
      previous="$arg"
    done
    if [[ "$url" == */latest ]]; then
      attempt=$(cat "$RUNNER_TEMP/verify-attempt" 2>/dev/null || echo 0)
      version=1.1.0
      if [[ "$VERIFY_MODE" == persistent || ( "$VERIFY_MODE" == delayed && "$attempt" == 1 ) || ( "$VERIFY_MODE" == late && "$attempt" -lt 23 ) ]]; then version=1.0.0; fi
      integrity=sha512-test; [[ "$VERIFY_MODE" != integrity ]] || integrity=sha512-wrong
      printf '{"name":"%s","version":"%s","dist":{"integrity":"%s"}}' "\${PACKAGE_NAME:-@disposabl/cli}" "$version" "$integrity" > "$output"; printf 200; exit
    fi
    attempt=$(cat "$RUNNER_TEMP/verify-attempt" 2>/dev/null || echo 0)
    attempt=$((attempt + 1)); echo "$attempt" > "$RUNNER_TEMP/verify-attempt"
    if [[ "$VERIFY_MODE" == auth ]]; then printf 401; exit; fi
    if [[ "$VERIFY_MODE" == network && "$attempt" == 1 ]]; then exit 7; fi
    if [[ "$VERIFY_MODE" == malformed ]]; then printf 'private-marker-not-json' > "$output"; printf 200; exit; fi
    if [[ "$VERIFY_MODE" == persistent || ( "$VERIFY_MODE" == delayed && "$attempt" == 1 ) || ( "$VERIFY_MODE" == late && "$attempt" -lt 23 ) ]]; then printf 404; exit; fi
    name=\${PACKAGE_NAME:-@disposabl/cli}; [[ "$VERIFY_MODE" != contradictory ]] || name=wrong-package
    printf '{"name":"%s","version":"1.1.0","dist":{"integrity":"sha512-test"}}' "$name" > "$output"; printf 200`,
  );
  script("sleep", 'echo sleep >> "$RUNNER_TEMP/verify-sleeps"');
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
        CLI_RECOVERY: "",
        EVENT_SHA: git("rev-parse", "HEAD").toString().trim(),
        RESOLVED_SHA: git("rev-parse", "HEAD").toString().trim(),
        GITHUB_OUTPUT: join(dir, "output"),
        ...env,
      },
    });
  expect(run("Preserve recovery metadata guard").status).toBe(0);
  return { dir, git, run };
}

test("shared checks use the resolved SHA and block every failed or skipped gate", () => {
  expect(workflow.jobs.checks.uses).toBe(
    "./.github/workflows/product-checks.yml",
  );
  expect(workflow.jobs.checks.with.source_sha).toBe(
    "${{ needs.resolve.outputs.source_sha }}",
  );
  expect(workflow.jobs.checks.permissions).toEqual({ contents: "read" });
  expect(workflow.jobs.checks.secrets).toBeUndefined();
  const github = {
    repository: "disposabl-dev/create-disposabl-app",
    ref: "refs/heads/main",
  };
  const evaluate = (
    job: string,
    needs: unknown,
    inputs: unknown,
    cancelled = false,
  ) =>
    new Function(
      "github",
      "needs",
      "inputs",
      "always",
      "cancelled",
      `return ${workflow.jobs[job].if}`,
    )(
      github,
      needs,
      inputs,
      () => true,
      () => cancelled,
    );
  const normal = { recovery_version: "", cli_recovery_version: "" };
  const generator = { recovery_version: "1.1.0", cli_recovery_version: "" };
  const cliRecovery = { recovery_version: "", cli_recovery_version: "1.1.0" };
  const needs = (resolve: string, checks: string, cli: string) => ({
    resolve: { result: resolve },
    checks: { result: checks },
    cli: { result: cli },
  });
  expect(evaluate("cli", needs("success", "success", "skipped"), normal)).toBe(
    true,
  );
  expect(
    evaluate("cli", needs("success", "success", "skipped"), cliRecovery),
  ).toBe(true);
  expect(
    evaluate("cli", needs("success", "success", "skipped"), generator),
  ).toBe(false);
  expect(
    evaluate("publish", needs("success", "success", "success"), normal),
  ).toBe(true);
  expect(
    evaluate("publish", needs("success", "success", "skipped"), generator),
  ).toBe(true);
  expect(
    evaluate("publish", needs("success", "success", "success"), cliRecovery),
  ).toBe(false);
  for (const result of ["failure", "cancelled", "skipped"]) {
    expect(
      evaluate("cli", needs("success", result, "success"), cliRecovery),
    ).toBe(false);
    expect(
      evaluate("publish", needs("success", "success", result), normal),
    ).toBe(false);
    expect(evaluate("cli", needs("success", result, "success"), normal)).toBe(
      false,
    );
    expect(
      evaluate("publish", needs("success", result, "success"), normal),
    ).toBe(false);
    expect(
      evaluate("publish", needs("success", result, "skipped"), generator),
    ).toBe(false);
    expect(
      evaluate("publish", needs(result, "success", "success"), normal),
    ).toBe(false);
  }
  expect(
    evaluate("publish", needs("success", "success", "failure"), normal),
  ).toBe(false);
  expect(
    evaluate("publish", needs("success", "success", "success"), normal, true),
  ).toBe(false);
});

test("release source resolves current push and fenced recovery tags", () => {
  const f = fixture();
  const head = f.git("rev-parse", "HEAD").toString().trim();
  expect(f.run("Resolve release source", {}, "resolve").status).toBe(0);
  expect(readFileSync(join(f.dir, "output"), "utf8")).toContain(`sha=${head}`);
  f.git("tag", "@disposabl/cli@1.1.0");
  f.git("tag", "v1.1.0");
  for (const input of [
    { CLI_RECOVERY: "1.1.0" },
    { GENERATOR_RECOVERY: "1.1.0" },
  ])
    expect(f.run("Resolve release source", input, "resolve").status).toBe(0);
  for (const input of [
    { CLI_RECOVERY: "1.0.0" },
    { CLI_RECOVERY: "bad" },
    { GENERATOR_RECOVERY: "2.0.0" },
    { EVENT_SHA: "0".repeat(40) },
  ])
    expect(f.run("Resolve release source", input, "resolve").status).not.toBe(
      0,
    );
  expect(
    f.run("Verify CLI recovery tag", { RESOLVED_SHA: "0".repeat(40) }).status,
  ).not.toBe(0);
  expect(
    f.run("Verify recovery tag", { RESOLVED_SHA: "0".repeat(40) }, "publish")
      .status,
  ).not.toBe(0);
  expect(
    f.run("Verify workflow source", {
      EVENT_SHA: head,
      RESOLVED_SHA: "0".repeat(40),
      RECOVERY: "",
    }).status,
  ).not.toBe(0);
});

test("recovery checks the actual historical tag commit and rejects detached or changed tags", () => {
  const f = fixture();
  const head = f.git("rev-parse", "HEAD").toString().trim();
  const old = f
    .git("rev-parse", "refs/tags/@disposabl/cli@1.0.0^{commit}")
    .toString()
    .trim();
  expect(old).not.toBe(head);
  f.git("tag", "v1.0.0", old);
  for (const input of [
    { CLI_RECOVERY: "1.0.0" },
    { GENERATOR_RECOVERY: "1.0.0" },
  ]) {
    expect(f.run("Resolve release source", input, "resolve").status).toBe(0);
    expect(
      readFileSync(join(f.dir, "output"), "utf8").trim().split("\n").at(-1),
    ).toBe(`sha=${old}`);
  }
  expect(
    f.run("Verify workflow source", {
      EVENT_SHA: head,
      RESOLVED_SHA: old,
      RECOVERY: "1.0.0",
    }).status,
  ).toBe(0);
  expect(
    f.run("Verify CLI recovery tag", { VERSION: "1.0.0", RESOLVED_SHA: old })
      .status,
  ).toBe(0);
  expect(f.git("rev-parse", "HEAD").toString().trim()).toBe(old);
  f.git("checkout", "--detach", head);
  expect(
    f.run(
      "Verify recovery tag",
      { VERSION: "1.0.0", RESOLVED_SHA: old },
      "publish",
    ).status,
  ).toBe(0);
  expect(f.git("rev-parse", "HEAD").toString().trim()).toBe(old);
  f.git("checkout", "--detach", head);
  f.git("tag", "-f", "v1.0.0", head);
  f.git("tag", "-f", "@disposabl/cli@1.0.0", head);
  expect(
    f.run("Verify CLI recovery tag", { VERSION: "1.0.0", RESOLVED_SHA: old })
      .status,
  ).not.toBe(0);
  expect(
    f.run(
      "Verify recovery tag",
      { VERSION: "1.0.0", RESOLVED_SHA: old },
      "publish",
    ).status,
  ).not.toBe(0);
  f.git("checkout", "-qb", "unrelated");
  f.git(
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.test",
    "commit",
    "--allow-empty",
    "-qm",
    "unrelated",
  );
  f.git("tag", "v2.0.0");
  f.git("checkout", "--detach", head);
  expect(
    f.run("Resolve release source", { GENERATOR_RECOVERY: "2.0.0" }, "resolve")
      .status,
  ).not.toBe(0);
});

test("missing newer tagged CLI blocks generator with exact recovery instruction", () => {
  const f = fixture();
  f.git("tag", "@disposabl/cli@1.1.0");
  const r = f.run("Verify CLI release and tag");
  expect(r.status).not.toBe(0);
  expect(r.stdout).toContain("cli_recovery_version=1.1.0");
});

test("post-publish verification retries only propagation and transient network errors", () => {
  for (const mode of ["delayed", "network"]) {
    const f = fixture();
    f.git("tag", "@disposabl/cli@1.1.0");
    writeFileSync(join(f.dir, "published"), "publish\n");
    const result = f.run("Verify published CLI release and tag", {
      VERIFY_MODE: mode,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      mode === "network" ? "exact curl exit 7" : "exact HTTP 404",
    );
    expect(readFileSync(join(f.dir, "verify-attempt"), "utf8").trim()).toBe(
      "2",
    );
    expect(readFileSync(join(f.dir, "verify-sleeps"), "utf8")).toBe("sleep\n");
    expect(readFileSync(join(f.dir, "published"), "utf8")).toBe("publish\n");
  }
});

test(
  "post-publish verification fails boundedly on 404 and immediately on contradictions or auth",
  { timeout: 30000 },
  () => {
    for (const [mode, attempts, sleeps] of [
      ["persistent", "25", 24],
      ["contradictory", "1", 0],
      ["malformed", "1", 0],
      ["integrity", "1", 0],
      ["auth", "1", 0],
    ] as const) {
      const f = fixture();
      f.git("tag", "@disposabl/cli@1.1.0");
      writeFileSync(join(f.dir, "published"), "publish\n");
      const result = f.run("Verify published CLI release and tag", {
        VERIFY_MODE: mode,
      });
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).not.toContain(
        "private-marker-not-json",
      );
      expect(readFileSync(join(f.dir, "verify-attempt"), "utf8").trim()).toBe(
        attempts,
      );
      const sleepFile = join(f.dir, "verify-sleeps");
      expect(
        existsSync(sleepFile)
          ? readFileSync(sleepFile, "utf8").trim().split("\n").length
          : 0,
      ).toBe(sleeps);
      expect(readFileSync(join(f.dir, "published"), "utf8")).toBe("publish\n");
    }
  },
);

test(
  "generator post-publish verification fails closed and never republishes",
  { timeout: 30000 },
  () => {
    for (const [mode, ok, attempts] of [
      ["delayed", true, "2"],
      ["network", true, "2"],
      ["persistent", false, "25"],
      ["contradictory", false, "1"],
      ["malformed", false, "1"],
      ["integrity", false, "1"],
      ["auth", false, "1"],
    ] as const) {
      const f = fixture();
      f.git("tag", "v1.0.0");
      f.git("tag", "v1.1.0");
      writeFileSync(join(f.dir, "published"), "publish\n");
      const result = f.run(
        "Verify published generator release and tag",
        {
          VERIFY_MODE: mode,
          PACKAGE_NAME: "create-disposabl-app",
        },
        "publish",
      );
      expect(result.status === 0).toBe(ok);
      expect(result.stdout + result.stderr).not.toContain(
        "private-marker-not-json",
      );
      expect(readFileSync(join(f.dir, "verify-attempt"), "utf8").trim()).toBe(
        attempts,
      );
      expect(readFileSync(join(f.dir, "published"), "utf8")).toBe("publish\n");
    }
  },
);

test(
  "both verifiers observe delayed availability without publishing again",
  { timeout: 30000 },
  () => {
    for (const [job, stepName, tag, packageName] of [
      [
        "cli",
        "Verify published CLI release and tag",
        "@disposabl/cli@",
        "@disposabl/cli",
      ],
      [
        "publish",
        "Verify published generator release and tag",
        "v",
        "create-disposabl-app",
      ],
    ] as const) {
      const f = fixture();
      if (job === "publish") f.git("tag", `${tag}1.0.0`);
      f.git("tag", `${tag}1.1.0`);
      writeFileSync(join(f.dir, "published"), "publish\n");
      const result = f.run(
        stepName,
        { VERIFY_MODE: "late", PACKAGE_NAME: packageName },
        job,
      );
      expect(result.status).toBe(0);
      expect(readFileSync(join(f.dir, "verify-attempt"), "utf8").trim()).toBe(
        "23",
      );
      expect(
        readFileSync(join(f.dir, "verify-sleeps"), "utf8").trim().split("\n")
          .length,
      ).toBe(22);
      expect(result.stdout).toContain("attempt 1/25: exact HTTP 404");
      expect(result.stdout).toContain("attempt 1/25: latest HTTP 200");
      expect(result.stdout).toContain("latest version 1.0.0; expected 1.1.0");
      expect(result.stdout).toContain("attempt 23/25: exact HTTP 200");
      expect(readFileSync(join(f.dir, "published"), "utf8")).toBe("publish\n");
    }
  },
);

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
      const resolved = f.git("rev-parse", "HEAD~1").toString().trim();
      expect(f.run("Preserve recovery metadata guard", {}, job).status).toBe(0);
      expect(
        f.run(
          job === "cli" ? "Verify CLI recovery tag" : "Verify recovery tag",
          { RESOLVED_SHA: resolved },
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
  expect(workflow.jobs.publish.needs).toEqual(["resolve", "checks", "cli"]);
  expect(workflow.jobs.publish.if).toContain("needs.cli.result == 'success'");
  expect(workflow.jobs.publish.if).toContain(
    "inputs.cli_recovery_version == ''",
  );
  expect(workflow.jobs.publish.if).toContain("inputs.recovery_version != ''");
  expect(
    steps.filter(
      (s: { name?: string }) => s.name === "Verify CLI release and tag",
    ),
  ).toHaveLength(1);
  expect(
    steps.filter(
      (s: { name?: string }) =>
        s.name === "Verify published CLI release and tag",
    ),
  ).toHaveLength(1);
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

test("recovery rejects absent or outdated browser harness before testing or publishing", () => {
  for (const mode of ["missing", "changed"]) {
    const f = fixture();
    const path = ".github/scripts/product-browser-check.py";
    if (mode === "missing") {
      f.git("rm", path);
      f.git(
        "-c",
        "user.name=test",
        "-c",
        "user.email=test@example.test",
        "commit",
        "-qm",
        "historical missing harness",
      );
    }
    f.git("tag", "v1.2.0");
    writeFileSync(join(f.dir, path), "# current harness fixture\n");
    f.git("add", path);
    f.git(
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.test",
      "commit",
      "-qm",
      "current harness",
    );
    const result = f.run(
      "Resolve release source",
      { GENERATOR_RECOVERY: "1.2.0" },
      "resolve",
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("Recovery unsupported:");
    expect(existsSync(join(f.dir, "published"))).toBe(false);
  }
});
