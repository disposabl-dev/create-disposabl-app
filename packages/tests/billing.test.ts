import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceFromCustomer,
  billingConfig,
  billingContext,
  billingPlans,
  billingRequest,
  purchaseRequest,
} from "../disposabl-kit/server/billing";
import { resolveFeatures } from "../disposabl-kit/feature-options";

describe("billing boundary", () => {
  test("payments requires authentication and disabled ignores credentials", () => {
    assert.deepEqual(resolveFeatures(["payments"]), [
      "authentication",
      "payments",
    ]);
    assert.equal(
      billingConfig(false, {
        AUTUMN_SECRET_KEY: "test-key",
        BILLING_RETURN_URL: "invalid",
      }),
      null,
    );
    assert.throws(() => billingConfig(true, {}));
  });
  test("disabled and unauthenticated calls cannot reach billing", async () => {
    let lookedUp = false;
    const identity = async () => {
      lookedUp = true;
      return null;
    };
    await assert.rejects(
      billingContext(false, {}, identity),
      /Payments are disabled/,
    );
    assert.equal(lookedUp, false);
    await assert.rejects(billingContext(true, {}, identity), /Please sign in/);
  });
  test("server chooses products and fixed quantity", () => {
    const monthly = purchaseRequest(
      "user",
      "monthly",
      "https://app.example/pricing",
    );
    assert.equal(monthly.customer_id, "user");
    assert.equal(monthly.plan_id, billingPlans.monthly);
    const topup = purchaseRequest(
      "user",
      "topup",
      "https://app.example/pricing",
    );
    assert.equal(topup.plan_id, billingPlans.topup);
    assert.deepEqual(topup.feature_quantities, [
      { feature_id: "credits", quantity: 500, adjustable: false },
    ]);
    assert.throws(() =>
      purchaseRequest("user", "other" as never, "https://app.example/pricing"),
    );
  });
  test("reads provider balances and hides provider errors", async () => {
    assert.equal(
      balanceFromCustomer({ balances: { credits: { remaining: 750 } } }),
      750,
    );
    assert.equal(balanceFromCustomer({}), null);
    const mock = (() =>
      Promise.resolve(
        new Response("private provider error", { status: 400 }),
      )) as typeof fetch;
    await assert.rejects(
      billingRequest("test-key", "billing.attach", {}, mock),
      /Billing is temporarily unavailable/,
    );
  });
});
