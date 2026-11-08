import assert from "node:assert/strict";
import { mock } from "bun:test";

// Isolated process: this fixture alone enables the billing boundary and supplies an identity.
const functions = await import("../../../disposabl-kit/server/lib/functions");
mock.module("../../../disposabl-kit/features", () => ({
  paymentsEnabled: true,
}));
mock.module("../../../disposabl-kit/server/lib/functions", () => ({
  ...functions,
  getSessionUserId: async () => "fixture-user",
}));
const billing = await import("../../../disposabl-kit/server/billing-functions");
process.env.AUTUMN_SECRET_KEY = "fixture-key";
process.env.BILLING_RETURN_URL = "https://app.example/pricing";

const catalog = {
  features: new Map<string, any>(),
  plans: new Map<string, any>(),
};
const calls: { method: string; body: any }[] = [];
let balance = 0;
let active = false;
let loseNextAttach = false;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 3470,
  async fetch(request) {
    assert.equal(request.headers.get("authorization"), "Bearer fixture-key");
    assert.equal(request.headers.get("x-api-version"), "2.6.0");
    const method = new URL(request.url).pathname.slice(4);
    const body = (await request.json()) as any;
    calls.push({ method, body });
    if (method === "features.list" || method === "plans.list") {
      const entries =
        method === "features.list" ? catalog.features : catalog.plans;
      return Response.json({ list: [...entries.values()] });
    }
    if (method === "features.create" || method === "plans.create") {
      const entries =
        method === "features.create" ? catalog.features : catalog.plans;
      const id = body.feature_id ?? body.plan_id;
      const entry = { ...body, id };
      entries.set(id, entry);
      return Response.json(entry);
    }
    if (method === "customers.get_or_create") {
      assert.equal(body.customer_id, "fixture-user");
      return Response.json({
        balances: { credits: { remaining: balance } },
        subscriptions: active
          ? [{ plan_id: "credits_monthly", status: "active" }]
          : [],
      });
    }
    if (method === "billing.attach") {
      if (loseNextAttach) {
        loseNextAttach = false;
        return new Response("fixture lost response", { status: 503 });
      }
      return Response.json({
        payment_url: `https://checkout.example/${calls.length}`,
      });
    }
    throw new Error(`Unexpected endpoint ${method}`);
  },
});
const nativeFetch = globalThis.fetch;
const fixtureFetch: typeof fetch = (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.origin, "https://api.useautumn.com");
  return nativeFetch(`http://127.0.0.1:3470${url.pathname}`, init);
};
globalThis.fetch = fixtureFetch;

const rows: any[] = [];
const db = {
  query: () => ({
    withIndex: (_: string, filter: (q: any) => any) => {
      const fields: Record<string, unknown> = {};
      const q = {
        eq: (key: string, value: unknown) => {
          fields[key] = value;
          return q;
        },
      };
      filter(q);
      const match = () =>
        rows.filter((row) =>
          Object.entries(fields).every(([key, value]) => row[key] === value),
        );
      return {
        unique: async () => match()[0] ?? null,
        first: async () => match()[0] ?? null,
      };
    },
  }),
  insert: async (_: string, row: any) => {
    rows.push({ ...row, _id: String(rows.length + 1) });
  },
  patch: async (_: string, id: string, changes: any) =>
    Object.assign(
      rows.find((row) => row._id === id),
      changes,
    ),
};
const ctx = {
  db,
  auth: {},
  runMutation: async (ref: any, args: any) => {
    const name = ref[Symbol.for("functionName")];
    const fn =
      name === "billing:beginAttempt"
        ? billing.beginAttempt
        : name === "billing:finishAttempt"
          ? billing.finishAttempt
          : null;
    assert.ok(fn, `Unexpected mutation ${name}`);
    return (fn as any)._handler({ db }, args);
  },
  runQuery: async (ref: any, args: any) => {
    const name = ref[Symbol.for("functionName")];
    const fn =
      name === "billing:hasUnknownAttempt"
        ? billing.hasUnknownAttempt
        : name === "billing:hasPendingMonthlyAttempt"
          ? billing.hasPendingMonthlyAttempt
          : null;
    assert.ok(fn, `Unexpected query ${name}`);
    return (fn as any)._handler({ db }, args);
  },
};
const checkout = (purchase: "monthly" | "topup", requestId: string) =>
  (billing.checkout as any)._handler(ctx, { purchase, requestId });
const snapshot = () => (billing.snapshot as any)._handler(ctx, {});
const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
];
try {
  const created = await (billing.setup as any)._handler({}, {});
  assert.equal(created.created.length, 3);
  const monthly = catalog.plans.get("credits_monthly");
  const topup = catalog.plans.get("credits_topup");
  assert.deepEqual(monthly.price, { amount: 5, interval: "month" });
  assert.deepEqual(monthly.items, [
    { feature_id: "credits", included: 750, reset: { interval: "month" } },
  ]);
  assert.deepEqual(topup.items, [
    {
      feature_id: "credits",
      price: {
        amount: 5,
        billing_units: 500,
        interval: "one_off",
        billing_method: "prepaid",
      },
    },
  ]);
  const savedCatalog = JSON.stringify([...catalog.features, ...catalog.plans]);
  assert.equal(
    (await (billing.setup as any)._handler({}, {})).created.length,
    0,
  );
  assert.equal(
    JSON.stringify([...catalog.features, ...catalog.plans]),
    savedCatalog,
  );

  const first = await checkout("monthly", ids[0]);
  assert.match(first.url, /^https:\/\/checkout\.example\//);
  assert.deepEqual(await checkout("monthly", ids[0]), first);
  let attaches = calls.filter((call) => call.method === "billing.attach");
  assert.equal(attaches.length, 1);
  assert.deepEqual(attaches[0].body, {
    customer_id: "fixture-user",
    plan_id: "credits_monthly",
    redirect_mode: "always",
    success_url: "https://app.example/pricing",
  });
  // Simulated provider settlement; checkout URL alone must not grant balance.
  assert.equal((await snapshot()).balance, 0);
  balance = 750;
  active = true;
  assert.equal((await snapshot()).balance, 750);
  await assert.rejects(
    checkout("monthly", ids[1]),
    /already have a monthly plan/,
  );

  loseNextAttach = true;
  await assert.rejects(checkout("topup", ids[1]), /status is unknown/);
  assert.equal((await snapshot()).checkoutNeedsReview, true);
  await assert.rejects(checkout("topup", ids[1]), /review/);
  await assert.rejects(checkout("topup", ids[2]), /review/);
  assert.equal(
    calls.filter((call) => call.method === "billing.attach").length,
    2,
  );
  await (billing.resolveAttempt as any)._handler(
    { db },
    {
      userId: "fixture-user",
      requestId: ids[1],
      outcome: "not_charged",
      evidence: "Fixture operator verified no charge",
    },
  );
  assert.deepEqual(await checkout("topup", ids[1]), {
    url: null,
    retryAllowed: true,
  });
  await checkout("topup", ids[2]);
  attaches = calls.filter((call) => call.method === "billing.attach");
  assert.deepEqual(attaches[2].body.feature_quantities, [
    { feature_id: "credits", quantity: 500, adjustable: false },
  ]);
  assert.equal(attaches[2].body.plan_id, "credits_topup");
  assert.equal((await snapshot()).balance, 750);
  balance = 1250;
  assert.equal((await snapshot()).balance, 1250);
  await checkout("topup", ids[3]);
  assert.equal(
    calls.filter((call) => call.method === "billing.attach").length,
    4,
  );
  balance = 1750;
  assert.equal((await snapshot()).balance, 1750);
  console.log(
    "HTTP fixture: catalog preservation, monthly routing, two top-up requests, unknown/reconciled retry, and snapshots passed",
  );
} finally {
  globalThis.fetch = nativeFetch;
  server.stop(true);
}
