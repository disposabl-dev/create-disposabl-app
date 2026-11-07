import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

// Keep Bun's YAML parser isolated from this workspace's Node-only type globals.
const workflow = JSON.parse(
  execFileSync(
    process.execPath,
    [
      "-e",
      "console.log(JSON.stringify(Bun.YAML.parse(await Bun.stdin.text())))",
    ],
    {
      input: readFileSync(
        new URL("../../.github/workflows/pipeline.yml", import.meta.url),
      ),
      encoding: "utf8",
    },
  ),
);

test("Android failure reporting runs independently only for an Android failure", () => {
  const job = workflow.jobs["android-failure"];
  assert.equal(job.needs, "android");
  assert.equal(job.if, "failure() && needs.android.result == 'failure'");
  assert.deepEqual(job.permissions, { contents: "read", "id-token": "write" });
  assert.equal(job["runs-on"], "ubuntu-24.04");
  assert.equal(job["timeout-minutes"], 5);
  assert.equal(job.steps[0].uses, "actions/checkout@v6");
  assert.equal(job.steps[1].uses, "actions/setup-node@v6");
  assert.equal(
    job.steps[2].run,
    "node .github/scripts/disposabl.mjs report android failed",
  );
  assert.equal(
    workflow.jobs.android.steps.some((step: { run?: string }) =>
      step.run?.includes("report android failed"),
    ),
    false,
  );
});
