import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextSubmissionStep,
  validMonthlyOffering,
} from "../../apps/mobile/src/features/management/submission-policy";

test("payment eligibility precedes selected platform connections", () => {
  assert.equal(nextSubmissionStep(true, 9, false, true, false), "payment");
  assert.equal(nextSubmissionStep(true, null, true, false, false), "payment");
  assert.equal(nextSubmissionStep(true, 10, true, true, false), "connections");
  assert.equal(nextSubmissionStep(true, 10, true, true, true), "send");
  assert.equal(nextSubmissionStep(false, null, true, false, false), "send");
});

test("paywall rejects missing, changed, or unverified extra products", () => {
  const monthly = {
    product: { identifier: "monthly", subscriptionPeriod: "P1M" },
  };
  const topup = { product: { identifier: "topup", subscriptionPeriod: null } };
  assert.equal(validMonthlyOffering([monthly], "monthly"), true);
  assert.equal(validMonthlyOffering([monthly, topup], "monthly"), false);
  assert.equal(validMonthlyOffering([topup], "monthly"), false);
  assert.equal(validMonthlyOffering([], "monthly"), false);
});
