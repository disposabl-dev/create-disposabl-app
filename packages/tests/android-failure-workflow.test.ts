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

test("Android uses its selected runner while allowing native build and cache finalization", () => {
  assert.equal(
    workflow.jobs.changes.outputs.android_runner,
    "${{ steps.platforms.outputs.android_runner }}",
  );
  assert.equal(
    workflow.jobs.android["runs-on"],
    "${{ needs.changes.outputs.android_runner }}",
  );
  assert.equal(workflow.jobs.android["timeout-minutes"], 30);
  assert.equal(
    workflow.jobs.web["runs-on"],
    "${{ needs.changes.outputs.linux_runner }}",
  );
});

test("product and generated apps share one artifact build and gate submission", () => {
  const job = workflow.jobs.android;
  assert.equal(job.if, "needs.web.outputs.android_build == 'true'");
  assert.equal(workflow.jobs["android-play"], undefined);
  assert.equal(
    job.steps.filter((step: { run?: string }) =>
      step.run?.includes("android-build"),
    ).length,
    1,
  );
  const submit = workflow.jobs["android-submit"];
  assert.equal(submit.needs, "android");
  assert.equal(
    submit.if,
    "github.event_name == 'push' && vars.ANDROID_PLAY_SUBMIT == 'true' && needs.android.result == 'success'",
  );
  assert.ok(
    submit.steps.some(
      (step: { uses?: string }) => step.uses === "actions/download-artifact@v4",
    ),
  );
  const fingerprint = workflow.jobs.web.steps.find(
    (step: { name?: string }) => step.name === "Fingerprint",
  );
  assert.equal(fingerprint.if, "needs.changes.outputs.android == 'true'");
  assert.match(fingerprint.env.UPDATE_POLICY, /disposabl-dev\/create-disposabl-app.*disabled/);
});

test("Android failure reporting handles failed and cancelled builds independently", () => {
  const job = workflow.jobs["android-failure"];
  const hasPlayJob = !!workflow.jobs["android-play"];
  assert.deepEqual(
    job.needs,
    hasPlayJob ? ["android", "android-play"] : "android",
  );
  assert.equal(
    job.if,
    hasPlayJob
      ? "always() && (needs.android.result == 'failure' || needs.android.result == 'cancelled' || needs.android-play.result == 'failure' || needs.android-play.result == 'cancelled')"
      : "always() && (needs.android.result == 'failure' || needs.android.result == 'cancelled')",
  );
  assert.deepEqual(job.permissions, { contents: "read", "id-token": "write" });
  assert.equal(job["runs-on"], "ubuntu-24.04");
  assert.equal(job["timeout-minutes"], 5);
  assert.equal(job.steps[0].uses, "actions/checkout@v6");
  assert.equal(job.steps[1].uses, "actions/setup-node@v6");
  assert.equal(
    job.steps[2].run,
    'node .github/scripts/disposabl.mjs report android failed "Android build failed or was cancelled; check the workflow log."',
  );
  assert.equal(
    workflow.jobs.android.steps.some((step: { run?: string }) =>
      step.run?.includes("report android failed"),
    ),
    false,
  );
});
