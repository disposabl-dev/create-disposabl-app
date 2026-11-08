import { test } from "node:test";
import assert from "node:assert/strict";
import { BillingSession } from "../disposabl-kit/mobile/billing/session";
import { pricing } from "../disposabl-kit/payments/config";
import { monthlyPlanFromCustomer } from "../disposabl-kit/server/billing";
import {
  paymentOptions,
  storeEligibility,
  preflightWebMonthly,
} from "../disposabl-kit/mobile/billing/policy";

function deferred() {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((done) => {
      resolve = done;
    }),
    resolve: () => resolve(),
  };
}

test("retained gate and account keep separate leases across focus and in-flight work", async () => {
  const started = deferred();
  const finish = deferred();
  const session = new BillingSession(async () => ({ configure() {} }) as never);
  const gate = session.acquire("alice");
  const purchase = session.run("alice", gate, "key", async () => {
    started.resolve();
    await finish.promise;
    return "result";
  });
  await started.promise;
  const account = session.acquire("alice");
  assert.equal(session.current("alice", gate), true);
  assert.equal(session.current("alice", account), true);
  assert.equal(session.beginTransaction(), true);
  assert.equal(session.beginTransaction(), false);
  session.endTransaction();
  session.release("alice", account);
  assert.equal(session.current("alice", gate), true);
  finish.resolve();
  assert.equal(await purchase, "result");
  const returnedAccount = session.acquire("alice");
  const pending = session.run("alice", returnedAccount, "key", async () => {
    await finish.promise;
    return true;
  });
  session.release("alice", returnedAccount);
  await assert.rejects(pending, /account changed/);
  assert.equal(session.current("alice", gate), true);
  const bob = session.acquire("bob");
  assert.equal(session.current("alice", gate), false);
  session.release("alice", gate);
  assert.equal(session.current("bob", bob), true);
});

test("web monthly preflight rechecks storefront, account, and both subscription sources", async () => {
  let current = true;
  let country = "USA";
  let active: string[] = [];
  const sdk = {
    canMakePayments: async () => true,
    getStorefront: async () => ({ countryCode: country }),
    getCustomerInfo: async () => ({ activeSubscriptions: active }),
    getOfferings: async () => ({
      current: {
        availablePackages: [
          { product: { identifier: "monthly", subscriptionPeriod: "P1M" } },
        ],
      },
    }),
  };
  const snapshot = async () => ({
    balance: 0,
    hasMonthlyPlan: false,
    nativeSubscriptionsEnabled: true,
    monthlyCheckoutPending: false,
    mobileWebCheckoutEnabled: true,
    customerId: "alice",
  });
  const run = () =>
    preflightWebMonthly(
      sdk as never,
      "ios",
      "monthly",
      "alice",
      snapshot,
      () => current,
    );
  await run();
  country = "CAN";
  await assert.rejects(run(), /unavailable/);
  country = "USA";
  active = ["monthly"];
  await assert.rejects(run(), /existing_subscription/);
  active = [];
  current = false;
  await assert.rejects(run(), /Account changed/);
});

test("account switch invalidates all retained views while work is in flight", async () => {
  const started = deferred();
  const finish = deferred();
  const session = new BillingSession(async () => ({ configure() {} }) as never);
  const gate = session.acquire("alice");
  const account = session.acquire("alice");
  const pending = session.run("alice", gate, "key", async () => {
    started.resolve();
    await finish.promise;
  });
  const rejected = assert.rejects(pending, /account changed/);
  await started.promise;
  const bob = session.acquire("bob");
  assert.equal(session.current("alice", account), false);
  finish.resolve();
  await rejected;
  assert.equal(session.current("bob", bob), true);
});

test("storefront policy fails closed and Android never offers web", async () => {
  const base = {
    platform: "ios",
    storefront: "USA",
    paymentsEnabled: true,
    webCheckoutEnabled: true,
    nativeReady: true,
    canMakePayments: true,
  };
  assert.deepEqual(paymentOptions(base), { native: true, web: true });
  for (const change of [
    { storefront: null },
    { storefront: "CAN" },
    { platform: "android" },
    { webCheckoutEnabled: false },
    { nativeReady: false },
    { canMakePayments: false },
    { paymentsEnabled: false },
  ])
    assert.equal(paymentOptions({ ...base, ...change }).web, false);
  assert.deepEqual(
    await storeEligibility(
      {
        canMakePayments: async () => true,
        getStorefront: async () => ({ countryCode: "USA" }),
      } as never,
      "ios",
    ),
    { canMakePayments: true, storefront: "USA" },
  );
  assert.deepEqual(
    await storeEligibility(
      {
        canMakePayments: async () => true,
        getStorefront: async () => {
          throw new Error("unknown");
        },
      } as never,
      "ios",
    ),
    { canMakePayments: true, storefront: null },
  );
});

test("monthly state includes scheduled plans and fails closed for unknown responses", () => {
  assert.equal(monthlyPlanFromCustomer({ subscriptions: [] }), false);
  for (const status of ["active", "scheduled"])
    assert.equal(
      monthlyPlanFromCustomer({
        subscriptions: [{ plan_id: pricing.monthly.planId, status }],
      }),
      true,
    );
  assert.equal(monthlyPlanFromCustomer({}), null);
  assert.equal(
    monthlyPlanFromCustomer({
      subscriptions: [{ planId: pricing.monthly.planId }],
    }),
    null,
  );
  assert.equal(
    monthlyPlanFromCustomer({
      subscriptions: [{ plan_id: pricing.monthly.planId, status: "unknown" }],
    }),
    null,
  );
});

test("sign-out rejects queued work and never configures anonymous purchasing", async () => {
  let loaded = false;
  const session = new BillingSession(async () => {
    loaded = true;
    throw new Error("must not load");
  });
  const version = session.select("alice");
  const pending = session.run("alice", version, "public", async () => true);
  session.release("alice", version);
  await assert.rejects(pending, /account changed/);
  assert.equal(loaded, false);
});

test("an in-flight purchase finishes before identity switches and stale results are discarded", async () => {
  const started = deferred();
  const finish = deferred();
  const calls: string[] = [];
  const sdk = {
    configure: ({ appUserID }: { appUserID: string }) =>
      calls.push(`configure:${appUserID}`),
    logIn: async (id: string) => {
      calls.push(`login:${id}`);
    },
  };
  const session = new BillingSession(async () => sdk as never);
  const alice = session.select("alice");
  const purchase = session.run("alice", alice, "public", async () => {
    calls.push("purchase:alice");
    started.resolve();
    await finish.promise;
    return "receipt";
  });
  const rejected = assert.rejects(purchase, /account changed/);
  await started.promise;
  const bob = session.select("bob");
  const next = session.run("bob", bob, "public", async () => {
    calls.push("read:bob");
  });
  assert.deepEqual(calls, ["configure:alice", "purchase:alice"]);
  finish.resolve();
  await rejected;
  await next;
  assert.deepEqual(calls, [
    "configure:alice",
    "purchase:alice",
    "login:bob",
    "read:bob",
  ]);
  session.release("alice", alice);
  assert.equal(session.current("bob", bob), true);
});

test("identity changes during SDK login cannot execute the old account operation", async () => {
  const started = deferred();
  const finish = deferred();
  const sdk = {
    configure: () => {},
    logIn: async () => {
      started.resolve();
      await finish.promise;
    },
  };
  const session = new BillingSession(async () => sdk as never);
  await session.run("alice", session.select("alice"), "public", async () => {});
  let purchased = false;
  const pending = session.run(
    "bob",
    session.select("bob"),
    "public",
    async () => {
      purchased = true;
    },
  );
  const rejected = assert.rejects(pending, /account changed/);
  await started.promise;
  session.select(null);
  finish.resolve();
  await rejected;
  assert.equal(purchased, false);
});

test("a failed login cannot leave another user's identity trusted", async () => {
  const logins: string[] = [];
  const session = new BillingSession(
    async () =>
      ({
        configure: () => {},
        logIn: async (id: string) => {
          logins.push(id);
          if (id === "bob") throw new Error("lost response");
        },
      }) as never,
  );
  await session.run("alice", session.select("alice"), "public", async () => {});
  await assert.rejects(
    session.run("bob", session.select("bob"), "public", async () => {}),
    /lost response/,
  );
  await session.run("alice", session.select("alice"), "public", async () => {});
  assert.deepEqual(logins, ["bob", "alice"]);
});

test("monthly paywall permits only a verified current offering and fresh customer", async () => {
  const { presentMonthlyPaywall, validMonthlyOffering } =
    await import("../disposabl-kit/mobile/billing/paywall");
  const monthly = {
    product: { identifier: "monthly", subscriptionPeriod: "P1M" },
  };
  const topup = { product: { identifier: "topup", subscriptionPeriod: null } };
  assert.equal(validMonthlyOffering([monthly], "monthly"), true);
  assert.equal(validMonthlyOffering([monthly, topup], "monthly"), false);
  assert.equal(validMonthlyOffering([topup], "monthly"), false);
  assert.equal(validMonthlyOffering([], "monthly"), false);
  const snapshot = async () => ({
    balance: 0,
    hasMonthlyPlan: false,
    nativeSubscriptionsEnabled: true,
    monthlyCheckoutPending: false,
  });
  let shown = 0;
  const sdk = {
    canMakePayments: async () => true,
    getCustomerInfo: async () => ({ activeSubscriptions: [] }),
    getOfferings: async () => ({ current: { availablePackages: [monthly] } }),
  };
  const show = async () => {
    shown++;
    return "cancelled" as const;
  };
  assert.equal(
    await presentMonthlyPaywall(
      sdk as never,
      snapshot,
      () => true,
      "monthly",
      show,
    ),
    "cancelled",
  );
  assert.equal(shown, 1);
  for (const monthlyCheckoutPending of [true, undefined]) {
    await assert.rejects(
      presentMonthlyPaywall(
        sdk as never,
        async () =>
          ({ ...(await snapshot()), monthlyCheckoutPending }) as never,
        () => true,
        "monthly",
        show,
      ),
      /website checkout/,
    );
  }
  await assert.rejects(
    presentMonthlyPaywall(
      { ...sdk, canMakePayments: async () => false } as never,
      snapshot,
      () => true,
      "monthly",
      show,
    ),
    /restricted/,
  );
  await assert.rejects(
    presentMonthlyPaywall(
      sdk as never,
      async () => ({ ...(await snapshot()), hasMonthlyPlan: true }),
      () => true,
      "monthly",
      show,
    ),
    /existing_subscription/,
  );
  await assert.rejects(
    presentMonthlyPaywall(sdk as never, snapshot, () => false, "monthly", show),
    /Account changed/,
  );
  await assert.rejects(
    presentMonthlyPaywall(
      {
        ...sdk,
        getOfferings: async () => ({
          current: { availablePackages: [monthly, topup] },
        }),
      } as never,
      snapshot,
      () => true,
      "monthly",
      show,
    ),
    /unavailable/,
  );
  assert.equal(shown, 1);
});

// Consumable top-ups share the session lease but do not depend on monthly checkout.
test("native top-up fails closed and checks identity at purchase", async () => {
  const { nativeTopupRoutes } =
    await import("../disposabl-kit/server/billing-native-capability");
  const { loadTopup, matchingTopupRoute, purchaseTopup } =
    await import("../disposabl-kit/mobile/billing/topup");
  const env = {
    REVENUECAT_CONSUMABLE_OWNER: "custom",
    REVENUECAT_CONSUMABLE_INTEGRATION_VERIFIED: "true",
    REVENUECAT_WEBHOOK_AUTH: "auth",
    REVENUECAT_PROJECT_ID: "project",
    AUTUMN_SECRET_KEY: "am_sk_test_fixture",
    REVENUECAT_ENVIRONMENT: "SANDBOX",
    REVENUECAT_ROUTES: JSON.stringify([
      { app: "apple", store: "APP_STORE", product: "coins" },
    ]),
  };
  assert.deepEqual(nativeTopupRoutes(false, env), []);
  for (const change of [
    { REVENUECAT_CONSUMABLE_OWNER: "managed" },
    { REVENUECAT_CONSUMABLE_INTEGRATION_VERIFIED: "false" },
    { REVENUECAT_ROUTES: "[]" },
    { REVENUECAT_WEBHOOK_AUTH: "" },
    { AUTUMN_SECRET_KEY: "am_sk_live_fixture" },
  ])
    assert.deepEqual(nativeTopupRoutes(true, { ...env, ...change }), []);
  const snapshot = {
    customerId: "user",
    nativeTopupRoutes: nativeTopupRoutes(true, env),
  };
  assert.equal(matchingTopupRoute(snapshot, "ios", "apple", "coins"), true);
  assert.equal(
    matchingTopupRoute(snapshot, "android", "apple", "coins"),
    false,
  );
  const product = {
    identifier: "coins",
    productCategory: "NON_SUBSCRIPTION",
    productType: "CONSUMABLE",
    priceString: "$5.00",
  };
  let purchases = 0;
  const sdk = {
    PRODUCT_CATEGORY: { NON_SUBSCRIPTION: "NON_SUBSCRIPTION" },
    getProducts: async () => [product],
    getAppUserID: async () => "user",
    canMakePayments: async () => true,
    purchaseStoreProduct: async () => {
      purchases++;
    },
  };
  for (const bad of [
    { ...product, identifier: "other" },
    { ...product, productCategory: "SUBSCRIPTION" },
    { ...product, productType: "UNKNOWN" },
  ])
    assert.equal(
      await loadTopup(
        { ...sdk, getProducts: async () => [bad] } as never,
        "ios",
        "coins",
      ),
      null,
    );
  assert.ok(
    await loadTopup(
      {
        ...sdk,
        getProducts: async () => [{ ...product, productType: "UNKNOWN" }],
      } as never,
      "android",
      "coins",
    ),
  );
  const run = (overrides = {}, state = snapshot, current = () => true) =>
    purchaseTopup(
      { ...sdk, ...overrides } as never,
      async () => state,
      current,
      "user",
      "ios",
      "apple",
      "coins",
    );
  await assert.rejects(run({ getAppUserID: async () => "other" }));
  await assert.rejects(run({ canMakePayments: async () => false }));
  await assert.rejects(run({}, { ...snapshot, nativeTopupRoutes: [] }));
  await assert.rejects(run({}, snapshot, () => false));
  let current = true;
  await assert.rejects(
    run(
      {
        getProducts: async () => {
          current = false;
          return [product];
        },
      },
      snapshot,
      () => current,
    ),
  );
  assert.equal(purchases, 0);
  await run();
  assert.equal(purchases, 1);
});

test("web top-up preflight rechecks storefront, product, route and account independently of monthly plan", async () => {
  const { preflightWebTopup } =
    await import("../disposabl-kit/mobile/billing/policy");
  const product = {
    identifier: "coins",
    productCategory: "NON_SUBSCRIPTION",
    productType: "CONSUMABLE",
    priceString: "$5",
  };
  const sdk = {
    canMakePayments: async () => true,
    getStorefront: async () => ({ countryCode: "USA" }),
    getAppUserID: async () => "user",
    getProducts: async () => [product],
    PRODUCT_CATEGORY: { NON_SUBSCRIPTION: "NON_SUBSCRIPTION" },
  };
  const state = {
    customerId: "user",
    mobileWebCheckoutEnabled: true,
    nativeTopupRoutes: [{ app: "apple", store: "APP_STORE", product: "coins" }],
    hasMonthlyPlan: true,
    monthlyCheckoutPending: true,
  };
  const run = (
    changes = {},
    snapshot = state,
    platform = "ios",
    current = () => true,
  ) =>
    preflightWebTopup(
      { ...sdk, ...changes } as never,
      platform,
      "apple",
      "coins",
      "user",
      async () => snapshot,
      current,
    );
  await run();
  for (const changes of [
    { canMakePayments: async () => false },
    { getStorefront: async () => null },
    { getStorefront: async () => ({ countryCode: "CAN" }) },
    {
      getStorefront: async () => {
        throw Error();
      },
    },
    { getAppUserID: async () => "other" },
    { getProducts: async () => [{ ...product, productType: "UNKNOWN" }] },
  ])
    await assert.rejects(run(changes));
  await assert.rejects(run({}, { ...state, nativeTopupRoutes: [] }));
  await assert.rejects(run({}, { ...state, customerId: "other" }));
  await assert.rejects(run({}, { ...state, mobileWebCheckoutEnabled: false }));
  await assert.rejects(run({}, state, "android"));
  let current = true;
  await assert.rejects(
    run(
      {
        getProducts: async () => {
          current = false;
          return [product];
        },
      },
      state,
      "ios",
      () => current,
    ),
  );
});
