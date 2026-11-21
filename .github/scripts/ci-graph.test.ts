import { test, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The explicit ref makes this usable against a candidate without changing checkout.
const source = (path: string) =>
  process.env.CI_GRAPH_REF
    ? execFileSync("git", ["show", `${process.env.CI_GRAPH_REF}:${path}`], {
        encoding: "utf8",
      })
    : readFileSync(path, "utf8");
const pipeline = Bun.YAML.parse(
  source(".github/workflows/pipeline.yml"),
) as any;
const product = Bun.YAML.parse(
  source(".github/workflows/product-checks.yml"),
) as any;
const action = Bun.YAML.parse(
  source(".github/actions/product-checks/action.yml"),
) as any;
const publish = Bun.YAML.parse(source(".github/workflows/publish.yml")) as any;
const reset = source("reset.ts");
const keys = [
  "linux_runner",
  "android_runner",
  "macos_runner",
  "changed",
  "android",
  "ios",
  "expo_connected",
  "expo_setup",
  "desktop",
  "packages",
];
const step = (job: any, name: string) =>
  job.steps.find((item: any) => item.name === name);
const hasRootCheck = (job: any) =>
  step(job, "Check")?.run ===
  "bun run generate\nbun run --parallel check:source test:ci\n";

test("deployment exports public client origins for subsequent Expo steps", () => {
  expect(step(pipeline.jobs.web, "Deploy").run).toBe(
    "bash .github/scripts/web.sh deploy",
  );
  const deploy = source(".github/scripts/web.sh");
  const command = deploy.match(/--cmd '([^']*)'/)![1];
  for (const appId of [undefined, "fixture-app"]) {
    const dir = mkdtempSync(join(tmpdir(), "deployment-origins-"));
    try {
      for (const path of ["bin", "packages/backend", ".github/scripts"])
        mkdirSync(join(dir, path), { recursive: true });
      writeFileSync(join(dir, "disposabl.json"), JSON.stringify({ appId }));
      writeFileSync(join(dir, ".github/scripts/web.sh"), deploy);
      writeFileSync(
        join(dir, "bin/bun"),
        '#!/usr/bin/env bash\nif [[ "$5" == build ]]; then printf "%s\\n%s\\n" "$VITE_CONVEX_URL" "$VITE_CONVEX_SITE_URL" > "$BUILD_VARS"; fi\n',
        { mode: 0o755 },
      );
      writeFileSync(
        join(dir, ".github/scripts/disposabl.mjs"),
        `import {appendFileSync} from "node:fs"; for (const file of [process.env.GITHUB_ENV, process.env.GITHUB_OUTPUT]) appendFileSync(file, "PUBLIC_SITE_URL=https://fixture.disposabl.xyz\\n");`,
      );
      const envFile = join(dir, "environment");
      const output = join(dir, "output");
      execFileSync("bash", ["-c", command], {
        cwd: join(dir, "packages/backend"),
        env: {
          ...process.env,
          PATH: `${join(dir, "bin")}:${process.env.PATH}`,
          CONVEX_URL: "https://fixture.convex.cloud",
          CONVEX_SITE_URL: "https://fixture.convex.site",
          PUBLIC_SITE_URL: "",
          GITHUB_WORKSPACE: dir,
          GITHUB_ENV: envFile,
          GITHUB_OUTPUT: output,
          BUILD_VARS: join(dir, "build-vars"),
          CHANNEL: "production",
        },
      });
      const expectedSite = appId
        ? "https://fixture.disposabl.xyz"
        : "https://fixture.convex.site";
      const env = Object.fromEntries(
        readFileSync(envFile, "utf8")
          .trim()
          .split("\n")
          .map((line) => line.split("=")),
      );
      expect(env.CONVEX_SITE_URL).toBe("https://fixture.convex.site");
      expect(env.PUBLIC_SITE_URL).toBe(expectedSite);
      expect(env.EXPO_PUBLIC_CONVEX_URL).toBe("https://fixture.convex.cloud");
      expect(env.EXPO_PUBLIC_CONVEX_SITE_URL).toBe(expectedSite);
      expect(readFileSync(join(dir, "build-vars"), "utf8")).toBe(
        `https://fixture.convex.cloud\n${expectedSite}\n`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function allowed(job: any, context: any, needs: any, cancelled = false) {
  const dependencies = Array.isArray(job.needs)
    ? job.needs
    : job.needs
      ? [job.needs]
      : [];
  const expression = job.if || "true";
  if (
    !expression.includes("always()") &&
    dependencies.some((name: string) => needs[name]?.result !== "success")
  )
    return false;
  const js = expression.replace(
    /needs\.(product-checks|expo-project)/g,
    'needs["$1"]',
  );
  return !!new Function(
    "github",
    "needs",
    "inputs",
    "vars",
    "always",
    "cancelled",
    `return (${js})`,
  )(
    context.github,
    needs,
    context.inputs || {},
    context.vars || {},
    () => true,
    () => cancelled,
  );
}
const context = (
  event: string,
  fork = false,
  repo = "disposabl-dev/create-disposabl-app",
) => ({
  github: {
    repository: repo,
    ref: "refs/heads/main",
    event_name: event,
    event: {
      pull_request: { head: { repo: { full_name: fork ? "fork/app" : repo } } },
    },
  },
});
const needs = (changes = "success", checks = "success", changed = "true") => ({
  changes: { result: changes, outputs: { changed } },
  "product-checks": { result: checks },
});

function assertGraph(p: any) {
  const j = p.jobs;
  expect(Object.keys(j.changes.outputs).sort()).toEqual([...keys].sort());
  for (const key of keys)
    expect(j.changes.outputs[key]).toBe(
      `\${{ steps.platforms.outputs.${key} }}`,
    );
  expect(j.changes.permissions).toEqual({
    contents: "read",
    "pull-requests": "read",
    actions: "read",
  });
  expect(
    step(j.changes, "Select affected platforms").env.EXPO_CONNECTED,
  ).toContain("secrets.EXPO_TOKEN");
  expect(allowed(j.changes, context("pull_request"), {})).toBe(true);
  expect(allowed(j.changes, context("pull_request", true), {})).toBe(false);
  expect(allowed(j.changes, context("push"), {})).toBe(true);
  const check = j["product-checks"];
  expect(check.uses).toBe("./.github/workflows/product-checks.yml");
  expect(check.with.source_sha).toContain("github.event.pull_request.head.sha");
  expect(check.needs).toBeUndefined();
  expect(allowed(check, context("pull_request"), {})).toBe(true);
  expect(allowed(check, context("pull_request", true), {})).toBe(false);
  expect(
    allowed(check, context("pull_request", false, "example/fork"), {}),
  ).toBe(false);
  expect(j.web.needs).toEqual(["changes", "product-checks"]);
  expect(step(j.web, "Check source formatting").run).toBe("bun fmt --check");
  expect(step(j.web, "Check").if).toContain("github.repository !=");
  expect(step(j.web, "Generate checked release inputs").run).toBe(
    "bun run generate",
  );
  expect(step(j.web, "Fingerprint")).toBeUndefined();
  expect(step(j.web, "Check product release guards")).toBeUndefined();
  expect(
    step({ steps: action.runs.steps }, "Check product release guards").if,
  ).toBe(
    "inputs.lane == 'unit' && inputs.cli_recovery_version == '' && inputs.recovery_version == ''",
  );
  expect(allowed(j.web, context("push"), needs("success", "failure"))).toBe(
    false,
  );
  expect(hasRootCheck(j.web)).toBe(true);
  expect(
    allowed(j.web, context("pull_request", true), needs("skipped", "skipped")),
  ).toBe(false);
  expect(
    allowed(j.web, context("pull_request"), needs("failure", "failure")),
  ).toBe(false);
  expect(allowed(j.web, context("pull_request"), needs(), true)).toBe(false);
  expect(allowed(j.web, context("pull_request"), needs())).toBe(true);
  expect(
    allowed(j.web, context("push"), needs("success", "success", "false")),
  ).toBe(true);
}

test("selector outputs and executable source select PR work and conservative main fallback", () => {
  assertGraph(pipeline);
  const dir = mkdtempSync(join(tmpdir(), "ci-graph-"));
  mkdirSync(join(dir, "bin"));
  writeFileSync(
    join(dir, "bin/gh"),
    '#!/bin/sh\ncase "$*" in *pulls/1/files*) echo apps/mobile/example.ts;; *) exit 1;; esac\n',
    { mode: 0o755 },
  );
  writeFileSync(
    join(dir, "disposabl.json"),
    JSON.stringify({ platforms: ["web", "android", "ios"], features: [] }),
  );
  try {
    const script = join(dir, "platforms.sh"),
      out = join(dir, "out");
    writeFileSync(script, source(".github/scripts/platforms.sh"));
    const run = (pr: string, event: string) => {
      writeFileSync(out, "");
      execFileSync("bash", [script], {
        cwd: dir,
        env: {
          ...process.env,
          PATH: `${dir}/bin:${process.env.PATH}`,
          PR: pr,
          GH_REPO: "fixture/app",
          RUNNER_TEMP: dir,
          GITHUB_OUTPUT: out,
          EXPO_CONNECTED: "true",
          EXPO_PROJECT_CONFIGURED: pr ? "true" : "false",
          IOS_BUILDS_ENABLED: "true",
          RELEASE_PREFIX: "app",
          CHANNEL: "preview",
          SOURCE: "a".repeat(40),
          GITHUB_EVENT_NAME: event,
          GITHUB_REF: "refs/heads/main",
        },
      });
      return Object.fromEntries(
        readFileSync(out, "utf8")
          .trim()
          .split("\n")
          .map((line) => {
            const i = line.indexOf("=");
            return [line.slice(0, i), line.slice(i + 1)];
          }),
      );
    };
    const pr = run("1", "pull_request"),
      main = run("", "push");
    for (const key of keys) {
      expect(pr[key]).toBeDefined();
      expect(main[key]).toBeDefined();
    }
    expect([pr.android, pr.ios, pr.changed]).toEqual(["true", "true", "true"]);
    expect([pr.expo_connected, main.expo_connected]).toEqual(["true", "true"]);
    expect([pr.expo_setup, main.expo_setup]).toEqual(["false", "true"]);
    expect([main.android, main.ios, main.changed]).toEqual([
      "true",
      "true",
      "true",
    ]);
    expect(JSON.parse(main.desktop)).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("enabled mobile jobs share first Expo setup and iOS reports both preview results", () => {
  const simulator = pipeline.jobs["ios-preview"];
  const update = pipeline.jobs["ios-preview-update"];
  const project = pipeline.jobs["expo-project"];
  const report = pipeline.jobs["ios-preview-report"];
  expect(project.needs).toEqual(["changes", "web"]);
  expect(simulator.needs).toEqual(["changes", "web", "expo-project"]);
  expect(update.needs).toEqual(simulator.needs);
  expect(update.env).toEqual(simulator.env);
  expect(report.needs).toContain("ios-preview");
  expect(report.needs).toContain("ios-preview-update");
  const needs = {
    changes: {
      result: "success",
      outputs: { expo_connected: "true", expo_setup: "false" },
    },
    web: { result: "success", outputs: { ios: "true" } },
    "expo-project": { result: "skipped" },
  };
  expect(allowed(project, context("pull_request"), needs)).toBe(false);
  expect(allowed(update, context("pull_request"), needs)).toBe(true);
  expect(allowed(update, context("push"), needs)).toBe(false);
  needs.changes.outputs.expo_setup = "true";
  expect(allowed(project, context("pull_request"), needs)).toBe(true);
  needs["expo-project"].result = "failure";
  expect(allowed(update, context("pull_request"), needs)).toBe(false);
  expect(allowed(simulator, context("pull_request"), needs)).toBe(false);
  needs["expo-project"].result = "success";
  expect(allowed(update, context("pull_request"), needs)).toBe(true);
  expect(allowed(simulator, context("pull_request"), needs)).toBe(true);
  const dir = mkdtempSync(join(tmpdir(), "ci-ios-report-"));
  try {
    writeFileSync(join(dir, "node"), '#!/bin/sh\nprintf "%s\\n" "$4"', {
      mode: 0o755,
    });
    const command = step(report, "Report combined iOS preview result").run;
    for (const [archive, ota, expo, expected] of [
      ["success", "success", "true", "ready"],
      ["success", "failure", "true", "failed"],
      ["failure", "success", "true", "failed"],
      ["success", "skipped", "false", "ready"],
    ]) {
      expect(
        execFileSync("bash", ["-c", command], {
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            ARCHIVE: archive,
            UPDATE: ota,
            EXPO_CONNECTED: expo,
          },
          encoding: "utf8",
        }).trim(),
      ).toBe(expected);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("generated reset retains root check and removes product-only gate", () => {
  const generated = structuredClone(pipeline);
  const begin = reset.indexOf('if (\n  !pipeline.jobs["product-checks"]');
  const end = reset.indexOf("if (eas.submit?.production)", begin);
  expect(begin).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(begin);
  new Function("pipeline", reset.slice(begin, end))(generated);
  expect(generated.jobs["product-checks"]).toBeUndefined();
  expect(generated.jobs.web.needs).toBe("changes");
  expect(hasRootCheck(generated.jobs.web)).toBe(true);
  expect(
    (reset.match(/packages\/tests\/publisher-colocation\.test\.ts/g) ?? [])
      .length,
  ).toBe(2);
  expect(
    allowed(generated.jobs.web, context("push"), needs("success", "skipped")),
  ).toBe(true);
  expect(
    allowed(generated.jobs.web, context("push"), needs("failure", "skipped")),
  ).toBe(false);
  expect(
    reset.slice(
      reset.indexOf("const productReleaseFiles"),
      reset.indexOf("const productProofTests"),
    ),
  ).toContain(".github/workflows/product-checks.yml");
});

test("product and recovery gates remain independent of root and native release jobs", () => {
  expect(step({ steps: action.runs.steps }, "Check source").if).toBe(
    "inputs.lane == 'source'",
  );
  const commands = action.runs.steps.map((x: any) => x.run || "").join("\n");
  expect(commands).toContain(
    "bun run --cwd packages/create-disposabl-app build",
  );
  expect(commands).toContain("bun run test:unit --parallel=4 --bail=1");
  expect(commands).toContain("bun test *.test.ts");
  expect(commands).toContain("product-browser-check.py");
  expect(product.jobs.check.env.GH_TOKEN).toBe("");
  const reusable = step(product.jobs.check, "Product checks");
  expect(reusable.with.lane).toBe("${{ matrix.lane }}");
  expect(reusable.with.browser_shard).toBe("${{ matrix.shard || '' }}");
  const [recovery, regular] = product.jobs.check.strategy.matrix.include
    .match(/\[[^\]]+\]/g)
    .map((value: string) => JSON.parse(value));
  expect(recovery).toEqual([{ lane: "unit" }, { lane: "browser" }]);
  expect(regular.map((job: { lane: string }) => job.lane)).toEqual([
    "source",
    "unit",
    "browser",
    "browser",
    "browser",
    "browser",
    "web-minimal",
    "web-android",
    "mobile-minimal",
    "all-platforms",
  ]);
  expect(
    regular
      .filter((job: { lane: string }) => job.lane === "browser")
      .map((job: { shard: string }) => job.shard),
  ).toEqual(["1/4", "2/4", "3/4", "4/4"]);
  expect(commands).toContain('verify:starter "$STARTER_PROFILE"');
  expect(reusable.uses).toBe("./.github/actions/product-checks");
  expect(reusable.with.source_sha).toBe("${{ inputs.source_sha }}");
  expect(reusable.with.cli_recovery_version).toBe(
    "${{ inputs.cli_recovery_version }}",
  );
  expect(reusable.with.recovery_version).toBe("${{ inputs.recovery_version }}");
  expect(product.jobs.check.outputs.source_sha).toBe(
    "${{ steps.checks.outputs.source_sha }}",
  );
  expect(action.outputs.source_sha.value).toBe(
    "${{ steps.source.outputs.sha }}",
  );
  expect(JSON.stringify(action)).not.toContain("secrets.");
  expect(
    product.jobs.check.steps.find((s: any) => s.uses === "actions/checkout@v6")
      .with.ref,
  ).toBe("${{ inputs.source_sha }}");
  expect(
    product.jobs.check.steps.find((s: any) => s.uses === "actions/checkout@v6")
      .with["fetch-depth"],
  ).toContain("inputs.recovery_version != ''");
  expect(
    action.runs.steps.filter((s: any) => s.uses === "actions/checkout@v6"),
  ).toHaveLength(0);
  expect(publish.jobs.checks.uses).toBe(
    "./.github/workflows/product-checks.yml",
  );
  expect(publish.jobs.checks.with.source_sha).toBe("${{ github.sha }}");
  const n = { checks: { result: "success" } };
  const cfg = {
    ...context("workflow_dispatch"),
    inputs: { recovery_version: "1.0.0", cli_recovery_version: "" },
  };
  expect(allowed(publish.jobs.publish, cfg, n)).toBe(true);
  expect(
    allowed(publish.jobs.publish, cfg, { checks: { result: "failure" } }),
  ).toBe(false);
  expect(
    allowed(publish.jobs.publish, cfg, { checks: { result: "skipped" } }),
  ).toBe(false);
  expect(allowed(publish.jobs.publish, cfg, n, true)).toBe(false);
  const releaseSteps = publish.jobs.publish.steps;
  const cliCheckout = releaseSteps.find((s: any) => s.id === "cli-checkout");
  const generatorCheckout = releaseSteps.find(
    (s: any) => s.id === "generator-checkout",
  );
  expect(allowed(cliCheckout, cfg, {})).toBe(false);
  expect(allowed(generatorCheckout, cfg, {})).toBe(true);
  const cli = {
    ...cfg,
    inputs: { recovery_version: "", cli_recovery_version: "1.0.0" },
  };
  expect(allowed(cliCheckout, cli, {})).toBe(true);
  expect(allowed(generatorCheckout, cli, {})).toBe(false);
  const submit = pipeline.jobs["android-submit"];
  expect(submit.needs).toBe("android");
  expect(pipeline.jobs.android.if).toContain(
    "needs.changes.outputs.android == 'true'",
  );
  expect(pipeline.jobs.android.outputs.release).toContain(
    "steps.artifacts.outcome",
  );
  expect(
    step(pipeline.jobs.android, "Prepare Android disk space").if,
  ).toContain("steps.fingerprint.outputs.build == 'true'");
  expect(step(pipeline.jobs.android, "Java")).toBeDefined();
  expect(step(pipeline.jobs.android, "Update").if).toContain(
    "steps.fingerprint.outputs.build == 'false'",
  );
  expect(
    allowed(
      submit,
      { ...context("push"), vars: { ANDROID_PLAY_SUBMIT: "true" } },
      {
        android: { result: "success", outputs: { built: "false" } },
      },
    ),
  ).toBe(false);
  const androidNeeds = {
    android: { result: "success", outputs: { built: "true" } },
  };
  expect(
    allowed(
      submit,
      { ...context("push"), vars: { ANDROID_PLAY_SUBMIT: "true" } },
      androidNeeds,
    ),
  ).toBe(true);
  expect(
    allowed(
      submit,
      { ...context("push"), vars: { ANDROID_PLAY_SUBMIT: "false" } },
      androidNeeds,
    ),
  ).toBe(false);
  expect(
    allowed(
      submit,
      { ...context("pull_request"), vars: { ANDROID_PLAY_SUBMIT: "true" } },
      androidNeeds,
    ),
  ).toBe(false);
  expect(
    allowed(
      submit,
      { ...context("push"), vars: { ANDROID_PLAY_SUBMIT: "true" } },
      { android: { result: "failure", outputs: { built: "false" } } },
    ),
  ).toBe(false);
  const reporter = pipeline.jobs["android-failure"];
  for (const result of ["failure", "cancelled"])
    expect(allowed(reporter, context("push"), { android: { result } })).toBe(
      true,
    );
  const reportNeeds = {
    android: { result: "skipped" },
    changes: { outputs: { android: "true" } },
    "expo-project": { result: "failure" },
  };
  expect(allowed(reporter, context("push"), reportNeeds)).toBe(true);
  reportNeeds["expo-project"].result = "skipped";
  expect(allowed(reporter, context("push"), reportNeeds)).toBe(false);
});

test("meaningful workflow mutations are rejected", () => {
  const missing = structuredClone(pipeline);
  delete missing.jobs.changes.outputs.ios;
  expect(() => assertGraph(missing)).toThrow();
  const noCheck = structuredClone(pipeline);
  noCheck.jobs.web.steps = noCheck.jobs.web.steps.filter(
    (x: any) => x.name !== "Check",
  );
  expect(() => assertGraph(noCheck)).toThrow();
  const fork = structuredClone(pipeline);
  fork.jobs.changes.if = "true";
  expect(() => assertGraph(fork)).toThrow();
  const badPublish = structuredClone(publish.jobs.publish);
  badPublish.if = "always()";
  const n = { checks: { result: "failure" }, cli: { result: "skipped" } };
  const c = {
    ...context("workflow_dispatch"),
    inputs: { recovery_version: "1.0.0", cli_recovery_version: "" },
  };
  const requiresChecks = (job: any) => expect(allowed(job, c, n)).toBe(false);
  requiresChecks(publish.jobs.publish);
  expect(() => requiresChecks(badPublish)).toThrow();
});

test("product iOS uploads to TestFlight and keeps App Review on demand", () => {
  const job = pipeline.jobs["ios-production"];
  expect(job["runs-on"]).toContain("xcode-27");
  expect(step(job, "Restore TestFlight upload provenance").with.path).toBe(
    ".ios-provenance/build.json",
  );
  expect(
    step(job, "Build product iOS and upload to TestFlight").env.DEVELOPER_DIR,
  ).toContain("Xcode_27.2");
  expect(JSON.stringify(job)).not.toMatch(/ASC_PRIVATE_KEY|apple-review.mjs/);
  expect(step(job, "Check existing TestFlight upload").run).toContain(
    "bun run store:review ios",
  );
  expect(step(job, "Publish compatible iOS production update").if).toContain(
    "ios-baseline.outputs.available == 'true'",
  );
  expect(step(job, "Build and submit to TestFlight").if).toContain(
    "github.repository != 'disposabl-dev/create-disposabl-app'",
  );
});
