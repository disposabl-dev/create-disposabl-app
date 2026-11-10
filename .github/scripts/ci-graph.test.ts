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
  "desktop",
  "packages",
];
const step = (job: any, name: string) =>
  job.steps.find((item: any) => item.name === name);
const hasRootCheck = (job: any) =>
  job.steps.some((item: any) => item.run === "bun run check");

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
    /needs\.product-checks/g,
    'needs["product-checks"]',
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
  const check = step(j.changes, "Product checks");
  expect(check.uses).toBe("./.github/actions/product-checks");
  expect(check.with.source_sha).toContain("github.event.pull_request.head.sha");
  expect(check.env.GH_TOKEN).toBe("");
  expect(allowed(check, context("pull_request"), {})).toBe(true);
  expect(
    allowed(check, context("pull_request", false, "example/fork"), {}),
  ).toBe(false);
  expect(j.web.needs).toEqual(["changes"]);
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

test("generated reset retains root check and removes product-only gate", () => {
  const generated = structuredClone(pipeline);
  const begin = reset.indexOf("if (\n  !pipeline.jobs.changes?.steps?");
  const end = reset.indexOf("if (eas.submit?.production)", begin);
  expect(begin).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(begin);
  new Function("pipeline", reset.slice(begin, end))(generated);
  expect(step(generated.jobs.changes, "Product checks")).toBeUndefined();
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
  expect(hasRootCheck({ steps: action.runs.steps })).toBe(false);
  const commands = action.runs.steps.map((x: any) => x.run || "").join("\n");
  expect(commands).toContain(
    "bun run --cwd packages/create-disposabl-app build",
  );
  expect(commands).toContain("bun run test:unit");
  expect(commands).toContain("bun test *.test.ts");
  expect(commands).toContain("product-browser-check.py");
  expect(product.jobs.check.env.GH_TOKEN).toBe("");
  const reusable = step(product.jobs.check, "Product checks");
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
    action.runs.steps.find((s: any) => s.uses === "actions/checkout@v6").with
      .ref,
  ).toBe("${{ inputs.source_sha }}");
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
  const androidNeeds = { android: { result: "success" } };
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
      { android: { result: "failure" } },
    ),
  ).toBe(false);
  const reporter = pipeline.jobs["android-failure"];
  for (const result of ["failure", "cancelled"])
    expect(allowed(reporter, context("push"), { android: { result } })).toBe(
      true,
    );
  expect(
    allowed(reporter, context("push"), { android: { result: "success" } }),
  ).toBe(false);
});

test("meaningful workflow mutations are rejected", () => {
  const missing = structuredClone(pipeline);
  delete missing.jobs.changes.outputs.ios;
  expect(() => assertGraph(missing)).toThrow();
  const noCheck = structuredClone(pipeline);
  noCheck.jobs.web.steps = noCheck.jobs.web.steps.filter(
    (x: any) => x.run !== "bun run check",
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
