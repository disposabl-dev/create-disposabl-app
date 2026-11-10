import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const workflow = JSON.parse(
  execFileSync(
    process.execPath,
    [
      "-e",
      "console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))",
    ],
    {
      input: readFileSync(
        new URL("../../.github/workflows/publish.yml", import.meta.url),
      ),
      encoding: "utf8",
    },
  ),
);
const job = workflow.jobs.publish;
const steps = job.steps as any[];
const cut = steps.findIndex((s) => s.id === "generator-checkout");
const cli = steps.slice(0, cut),
  generator = steps.slice(cut);
const inputs = (recovery = "", cliRecovery = "") => ({
  recovery_version: recovery,
  cli_recovery_version: cliRecovery,
});
function evaluate(
  expression: string,
  args: any,
  needs = { checks: { result: "success" } },
  cancelled = false,
) {
  return !!new Function(
    "inputs",
    "needs",
    "github",
    "always",
    "cancelled",
    `return (${expression})`,
  )(
    args,
    needs,
    {
      repository: "disposabl-dev/create-disposabl-app",
      ref: "refs/heads/main",
    },
    () => true,
    () => cancelled,
  );
}
function enabled(step: any, args: any, previousSuccess = true) {
  return previousSuccess && evaluate(step.if || "true", args);
}
function byName(phase: any[], name: string) {
  const found = phase.filter((s) => s.name === name);
  assert.equal(found.length, 1, name);
  return found[0];
}

test("single publisher retains required checks and serializes execution", () => {
  assert.deepEqual(Object.keys(workflow.jobs), ["checks", "publish"]);
  assert.deepEqual(workflow.jobs.checks.permissions, { contents: "read" });
  assert.deepEqual(job.needs, ["checks"]);
  assert.deepEqual(job.permissions, { contents: "write", "id-token": "write" });
  assert.equal(workflow.concurrency.group, "npm-cli-publish");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(workflow.concurrency.queue, "max");
  assert.equal(job.concurrency.group, "npm-publish");
  assert.equal(job.concurrency["cancel-in-progress"], false);
  assert.equal(job.concurrency.queue, "max");
  for (const result of ["failure", "cancelled", "skipped"]) {
    assert.equal(evaluate(job.if, inputs(), { checks: { result } }), false);
  }
  assert.equal(evaluate(job.if, inputs(), undefined, true), false);
  assert.equal(evaluate(job.if, inputs()), true);
});

test("normal and both recovery modes select the right ordered phases", () => {
  for (const [args, runCli, runGenerator] of [
    [inputs(), true, true],
    [inputs("", "1.0.0"), true, false],
    [inputs("1.0.0", ""), false, true],
  ] as const) {
    assert.equal(enabled(cli[0], args), runCli);
    assert.equal(enabled(generator[0], args), runGenerator);
    assert.equal(
      enabled(byName(cli, "Verify CLI recovery tag"), args),
      !!args.cli_recovery_version,
    );
    assert.equal(
      enabled(byName(generator, "Verify recovery tag"), args),
      !!args.recovery_version,
    );
  }
  assert.equal(
    enabled(byName(cli, "Verify published CLI release and tag"), inputs()),
    true,
  );
  assert.equal(
    enabled(
      byName(generator, "Verify published generator release and tag"),
      inputs(),
    ),
    true,
  );
  assert.ok(
    steps.indexOf(byName(cli, "Verify published CLI release and tag")) < cut,
  );
  assert.equal(
    generator.every((s) => !enabled(s, inputs(), false)),
    true,
  );
  assert.equal(
    generator.every((s) => !enabled(s, inputs("1.0.0"), false)),
    true,
  );
  assert.equal(
    cli.every((s) => !enabled(s, inputs("1.0.0"))),
    true,
  );
  assert.equal(
    generator.every((s) => !enabled(s, inputs("", "1.0.0"))),
    true,
  );
  for (const step of steps) {
    assert.equal(step["continue-on-error"], undefined);
    assert.equal(typeof step.if, "string");
    assert.equal(step.if.includes("always()"), false);
  }
});

test("fresh checkouts, source guards and frozen installs stay separate", () => {
  assert.equal(cli[0].uses, "actions/checkout@v6");
  assert.equal(generator[0].uses, "actions/checkout@v6");
  assert.deepEqual(
    [cli[0].with.path, generator[0].with.path],
    ["cli-source", "generator-source"],
  );
  for (const phase of [cli, generator]) {
    assert.equal(phase[0].with.ref, "${{ github.sha }}");
    assert.equal(phase[0].with["fetch-depth"], 0);
    assert.equal(phase[0].with["persist-credentials"], false);
    assert.equal(
      byName(phase, "Verify workflow source").env.RESOLVED_SHA,
      "${{ needs.checks.outputs.source_sha }}",
    );
    assert.equal(
      phase.filter((s) =>
        s.run?.startsWith("bun install --frozen-lockfile --cache-dir "),
      ).length,
      1,
    );
    assert.ok(
      phase.indexOf(byName(phase, "Preserve recovery metadata guard")) <
        phase.findIndex(
          (s) =>
            s.name?.startsWith("Verify ") && s.name.includes("recovery tag"),
        ),
    );
  }
  const cliCache = cli.find((s) => s.uses === "actions/cache@v4");
  const generatorCache = generator.find((s) => s.uses === "actions/cache@v4");
  assert.equal(cliCache.with.path, "${{ runner.temp }}/bun-cli-cache");
  assert.equal(
    generatorCache.with.path,
    "${{ runner.temp }}/bun-generator-cache",
  );
  assert.match(cliCache.with.key, /^bun-cli-/);
  assert.match(generatorCache.with.key, /^bun-generator-/);
  assert.match(
    cli.find((s) => s.run?.startsWith("bun install --frozen-lockfile")).run,
    /bun-cli-cache/,
  );
  assert.match(
    generator.find((s) => s.run?.startsWith("bun install --frozen-lockfile"))
      .run,
    /bun-generator-cache/,
  );
  assert.equal(
    cli.find((s) =>
      s.run?.startsWith("bun install --frozen-lockfile --cache-dir "),
    )["working-directory"],
    "cli-source",
  );
  assert.equal(
    generator.find((s) =>
      s.run?.startsWith("bun install --frozen-lockfile --cache-dir "),
    )["working-directory"],
    "generator-source/packages/create-disposabl-app",
  );
});

test("separate local checkouts isolate CLI changes from generator source", () => {
  const dir = mkdtempSync(join(tmpdir(), "publisher-checkouts-"));
  try {
    const origin = join(dir, "origin");
    mkdirSync(origin);
    const git = (cwd: string, ...args: string[]) =>
      execFileSync("/usr/bin/git", args, { cwd, stdio: "pipe" })
        .toString()
        .trim();
    git(origin, "init", "-q");
    writeFileSync(join(origin, "source"), "committed");
    git(origin, "add", "source");
    git(
      origin,
      "-c",
      "user.name=fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "base",
    );
    const sha = git(origin, "rev-parse", "HEAD");
    git(dir, "clone", "-q", "--local", origin, "cli-source");
    writeFileSync(join(dir, "cli-source/source"), "changed by CLI phase");
    git(dir, "clone", "-q", "--local", origin, "generator-source");
    assert.equal(git(join(dir, "generator-source"), "rev-parse", "HEAD"), sha);
    assert.equal(
      git(join(dir, "generator-source"), "status", "--porcelain"),
      "",
    );
    assert.equal(
      readFileSync(join(dir, "generator-source/source"), "utf8"),
      "committed",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Model only lock acquisition/release, not GitHub queue ordering or cancellation
// of pending jobs from older workflows with the default single-pending policy.
test("old and new lock acquisition has no cycle or publisher overlap", () => {
  type State = {
    oldCli: number;
    oldGenActive: boolean;
    oldGenWaiting: number;
    next: number;
  };
  // oldCli: 0 checking, 1 waiting, 2 active, 3 done; next: 0 waiting A,
  // 1 checks holding A, 2 waiting B, 3 publishing A+B, 4 done, 5 cancelled.
  for (const mode of [
    "normal",
    "cli-recovery",
    "generator-recovery",
    "rerun",
  ]) {
    for (const initial of [
      { oldCli: 0, oldGenActive: false, oldGenWaiting: 0, next: 0 },
      { oldCli: 1, oldGenActive: true, oldGenWaiting: 0, next: 0 },
      { oldCli: 2, oldGenActive: true, oldGenWaiting: 0, next: 0 },
      { oldCli: 3, oldGenActive: true, oldGenWaiting: 1, next: 0 },
    ] satisfies State[]) {
      const pending = [initial],
        seen = new Set<string>();
      while (pending.length) {
        const state = pending.pop()!;
        const key = JSON.stringify(state);
        if (seen.has(key)) continue;
        seen.add(key);
        const aNew = [1, 2, 3].includes(state.next);
        const aOld = state.oldCli === 2;
        const bNew = state.next === 3;
        const bOld = state.oldGenActive;
        assert.equal(aNew && aOld, false, mode);
        assert.equal(bNew && bOld, false, mode);
        assert.equal(bNew && aOld, false, mode);
        const normal: State[] = [];
        const add = (change: Partial<State>) =>
          normal.push({ ...state, ...change });
        if (state.oldCli === 0) add({ oldCli: 1 });
        if (state.oldCli === 1 && !aNew) add({ oldCli: 2 });
        if (state.oldCli === 2)
          add({ oldCli: 3, oldGenWaiting: state.oldGenWaiting + 1 });
        if (state.oldGenActive) add({ oldGenActive: false });
        if (!bNew && !bOld && state.oldGenWaiting > 0)
          add({ oldGenActive: true, oldGenWaiting: state.oldGenWaiting - 1 });
        if (state.next === 0 && !aOld) add({ next: 1 });
        if (state.next === 1) add({ next: 2 });
        if (state.next === 2 && !bOld) add({ next: 3 });
        if (state.next === 3) add({ next: 4 });
        const unfinished =
          state.oldCli !== 3 ||
          state.oldGenActive ||
          state.oldGenWaiting > 0 ||
          state.next < 4;
        if (unfinished)
          assert.ok(normal.length > 0, `lock cycle in ${mode}: ${key}`);
        pending.push(...normal);
        if (state.next < 4) pending.push({ ...state, next: 5 });
      }
    }
  }
});
