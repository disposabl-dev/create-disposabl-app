import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { nextSubmissionStep } from "../../apps/mobile/src/features/management/submission-policy";

test("payment eligibility precedes selected platform connections", () => {
  assert.equal(nextSubmissionStep(true, 9, false, true, false), "payment");
  assert.equal(nextSubmissionStep(true, null, true, false, false), "payment");
  assert.equal(nextSubmissionStep(true, 10, true, true, false), "connections");
  assert.equal(nextSubmissionStep(true, 10, true, true, true), "send");
  assert.equal(nextSubmissionStep(false, null, true, false, false), "send");
});

test("credit refresh preserves the conversation draft until an explicit send", () => {
  const result = spawnSync(
    process.execPath,
    [
      "test",
      join(
        import.meta.dirname,
        "fixtures/compute-convex/mobile-resume.test.mjs",
      ),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("account changes fence billing and attachment cleanup", () => {
  const result = spawnSync(
    process.execPath,
    [
      "test",
      join(
        import.meta.dirname,
        "fixtures/compute-convex/mobile-account-transition.test.mjs",
      ),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
