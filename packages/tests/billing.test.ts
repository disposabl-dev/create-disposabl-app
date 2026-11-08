import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceFromCustomer,
  billingConfig,
  billingContext,
  billingRequest,
  purchaseRequest,
  monthlyPlanFromCustomer,
  mobileWebCheckoutConfigured,
  checkoutUrl,
} from "../disposabl-kit/server/billing";
import {
  pricing,
  creditQuantity,
  formatPrice,
  monthlyLabel,
  type Pricing,
} from "../disposabl-kit/payments/config";
import { resolveFeatures } from "../disposabl-kit/feature-options";

describe("billing boundary", () => {
  test("unusable checkout responses are treated as unknown", () => {
    assert.equal(
      checkoutUrl({ payment_url: "https://checkout.example/pay" }),
      "https://checkout.example/pay",
    );
    for (const result of [
      {},
      { payment_url: null },
      { payment_url: "http://example.com" },
      { payment_url: "https://user:pass@example.com" },
      { payment_url: "invalid" },
    ])
      assert.equal(checkoutUrl(result), null);
  });
  test("mobile checkout capability requires a configured secure pricing origin and native sync", () => {
    const env = {
      AUTUMN_SECRET_KEY: "key",
      BILLING_RETURN_URL: "https://example.com/pricing",
      MOBILE_WEB_CHECKOUT_ENABLED: "true",
      REVENUECAT_SYNC_ENABLED: "true",
    };
    assert.equal(mobileWebCheckoutConfigured(true, env), true);
    assert.equal(mobileWebCheckoutConfigured(false, env), false);
    for (const changes of [
      { MOBILE_WEB_CHECKOUT_ENABLED: "false" },
      { REVENUECAT_SYNC_ENABLED: "false" },
      { BILLING_RETURN_URL: "http://localhost/pricing" },
      { BILLING_RETURN_URL: "https://example.com/other" },
      { AUTUMN_SECRET_KEY: "" },
    ])
      assert.equal(
        mobileWebCheckoutConfigured(true, { ...env, ...changes }),
        false,
      );
  });
  test("editable starter prices drive server quantities and displayed allowances", () => {
    const example: Pricing = {
      currency: "USD",
      creditsPerDollar: 100,
      featureId: "credits",
      monthly: { planId: "credits_monthly", price: 5, creditMultiplier: 1.5 },
      topup: { planId: "credits_topup", price: 5 },
    };
    assert.equal(formatPrice(example.monthly.price, example), "$5");
    assert.equal(creditQuantity("monthly", example), 750);
    assert.equal(creditQuantity("topup", example), 500);
    assert.equal(monthlyLabel(example), "Monthly · 50% more");
    assert.equal(
      creditQuantity("topup", {
        ...example,
        topup: { ...example.topup, price: 1.1 },
      }),
      110,
    );
    const custom: Pricing = {
      ...example,
      featureId: "workspace_credits",
      creditsPerDollar: 80,
      monthly: {
        planId: "workspace_monthly",
        price: 12,
        creditMultiplier: 1.25,
      },
      topup: { planId: "workspace_topup", price: 3 },
    };
    const request = purchaseRequest(
      "owner",
      "topup",
      "https://example.com/pricing",
      custom,
    );
    assert.equal(request.plan_id, "workspace_topup");
    assert.deepEqual(request.feature_quantities, [
      { feature_id: "workspace_credits", quantity: 240, adjustable: false },
    ]);
    assert.equal(creditQuantity("monthly", custom), 1200);
    assert.equal(monthlyLabel(custom), "Monthly · 25% more");
    assert.equal(formatPrice(custom.monthly.price, custom), "$12");
    assert.equal(
      balanceFromCustomer(
        { balances: { workspace_credits: { remaining: 37 } } },
        custom,
      ),
      37,
    );
    assert.equal(
      monthlyPlanFromCustomer(
        { subscriptions: [{ plan_id: "workspace_monthly", status: "active" }] },
        custom,
      ),
      true,
    );
  });
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
    assert.equal(monthly.plan_id, pricing.monthly.planId);
    const topup = purchaseRequest(
      "user",
      "topup",
      "https://app.example/pricing",
    );
    assert.equal(topup.plan_id, pricing.topup.planId);
    assert.deepEqual(topup.feature_quantities, [
      {
        feature_id: pricing.featureId,
        quantity: creditQuantity("topup"),
        adjustable: false,
      },
    ]);
    assert.throws(() =>
      purchaseRequest("user", "other" as never, "https://app.example/pricing"),
    );
  });
  test("reads provider balances and hides provider errors", async () => {
    assert.equal(
      balanceFromCustomer({
        balances: { [pricing.featureId]: { remaining: 750 } },
      }),
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
