import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = Bun.YAML.parse(readFileSync(new URL("../../.github/workflows/pipeline.yml", import.meta.url), "utf8")) as any;

test("Android failure reporting runs independently only for an Android failure", () => {
  const job = workflow.jobs["android-failure"];
  assert.equal(job.needs, "android");
  assert.equal(job.if, "failure() && needs.android.result == 'failure'");
  for (const result of ["success", "skipped", "blocked", "cancelled"]) assert.notEqual(result, "failure");
  assert.deepEqual(job.permissions, { contents: "read", "id-token": "write" });
  assert.equal(job["runs-on"], "ubuntu-24.04");
  assert.equal(job["timeout-minutes"], 5);
  assert.equal(job.steps[0].uses, "actions/checkout@v6");
  assert.equal(job.steps[1].uses, "actions/setup-node@v6");
  assert.equal(job.steps[2].run, "node .github/scripts/disposabl.mjs report android failed");
  assert.equal(workflow.jobs.android.steps.some((step: { run?: string }) => step.run?.includes("report android failed")), false);
});
