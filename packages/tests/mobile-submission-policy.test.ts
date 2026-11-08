import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSubmissionStep } from "../../apps/mobile/src/features/management/submission-policy";

test("payment eligibility precedes selected platform connections", () => {
  assert.equal(nextSubmissionStep(true, 9, false, true, false), "payment");
  assert.equal(nextSubmissionStep(true, null, true, false, false), "payment");
  assert.equal(nextSubmissionStep(true, 10, true, true, false), "connections");
  assert.equal(nextSubmissionStep(true, 10, true, true, true), "send");
  assert.equal(nextSubmissionStep(false, null, true, false, false), "send");
});
