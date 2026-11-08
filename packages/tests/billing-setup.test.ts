import { test } from "node:test";
import assert from "node:assert/strict";
import { setupBilling } from "../disposabl-kit/server/billing-setup";
import { pricing, type Pricing } from "../disposabl-kit/payments/config";

type Entry = { id: string; [key: string]: unknown };
type Call = { method: string; body: Record<string, unknown> };
const env = { AUTUMN_SECRET_KEY: "fixture-key" };
function provider() {
  const features = new Map<string, Entry>();
  const plans = new Map<string, Entry>();
  const calls: Call[] = [];
  const fetcher = (async (url, init) => {
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("x-api-version"), "2.6.0");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer fixture-key",
    );
    const method = String(url).replace("https://api.useautumn.com/v1/", "");
    const body = JSON.parse(String(init?.body));
    calls.push({ method, body });
    const entries = method.startsWith("features.") ? features : plans;
    if (method.endsWith(".list")) {
      assert.deepEqual(
        body,
        method === "plans.list"
          ? { include_archived: true, all_versions: true }
          : {},
      );
      return Response.json({ list: [...entries.values()] });
    }
    assert.ok(["features.create", "plans.create"].includes(method));
    const id = body.feature_id ?? body.plan_id;
    if (entries.has(id))
      return Response.json({ error: "duplicate" }, { status: 409 });
    const entry = { ...body, id };
    entries.set(id, entry);
    return Response.json(entry);
  }) as typeof fetch;
  return { features, plans, calls, fetcher };
}

test("disabled setup reads neither credentials, pricing nor provider", async () => {
  const unreadable = new Proxy(
    {},
    {
      get() {
        throw new Error("must not read");
      },
    },
  );
  const fetcher = (() => {
    throw new Error("must not fetch");
  }) as typeof fetch;
  assert.deepEqual(
    await setupBilling(false, unreadable, unreadable as Pricing, fetcher),
    {
      enabled: false,
      created: [],
      preserved: [],
    },
  );
});

test("enabled setup needs this deployment's key and valid pricing before requests", async () => {
  const p = provider();
  await assert.rejects(
    setupBilling(true, {}, pricing, p.fetcher),
    /AUTUMN_SECRET_KEY on this Convex deployment/,
  );
  for (const config of [
    { ...pricing, creditsPerDollar: 0 },
    { ...pricing, monthly: { ...pricing.monthly, creditMultiplier: 0 } },
    { ...pricing, monthly: { ...pricing.monthly, price: NaN } },
    { ...pricing, topup: { ...pricing.topup, planId: pricing.monthly.planId } },
  ])
    await assert.rejects(
      setupBilling(true, env, config, p.fetcher),
      /payments\/config.ts/,
    );
  assert.equal(p.calls.length, 0);
});

test("defaults create monthly included credits and nonexpiring prepaid top-ups once", async () => {
  const p = provider();
  const first = await setupBilling(true, env, pricing, p.fetcher);
  assert.equal(first.created.length, 3);
  assert.equal(p.calls.length, 5);
  assert.deepEqual(p.calls.slice(2), [
    {
      method: "features.create",
      body: {
        feature_id: "credits",
        name: "Credits",
        type: "metered",
        consumable: true,
      },
    },
    {
      method: "plans.create",
      body: {
        plan_id: "credits_monthly",
        name: "Monthly credits",
        auto_enable: false,
        price: { amount: 5, interval: "month" },
        items: [
          {
            feature_id: "credits",
            included: 750,
            reset: { interval: "month" },
          },
        ],
      },
    },
    {
      method: "plans.create",
      body: {
        plan_id: "credits_topup",
        name: "Credits top-up",
        add_on: true,
        auto_enable: false,
        items: [
          {
            feature_id: "credits",
            price: {
              amount: 5,
              billing_units: 500,
              interval: "one_off",
              billing_method: "prepaid",
            },
          },
        ],
      },
    },
  ]);
  for (let i = 0; i < 3; i++) {
    const next = await setupBilling(true, env, pricing, p.fetcher);
    assert.deepEqual(next.created, []);
    assert.deepEqual(next.preserved, first.created);
  }
  assert.equal(
    p.calls.filter((call) => call.method.endsWith(".create")).length,
    3,
  );
});

test("edited config drives new IDs, prices and quantities without assuming USD", async () => {
  const p = provider();
  const config: Pricing = {
    currency: "EUR",
    featureId: "tokens",
    creditsPerDollar: 80,
    monthly: { planId: "custom_monthly", price: 12, creditMultiplier: 1.25 },
    topup: { planId: "custom_topup", price: 3 },
  };
  await setupBilling(true, env, config, p.fetcher);
  assert.deepEqual(p.plans.get("custom_monthly")?.price, {
    amount: 12,
    interval: "month",
  });
  assert.deepEqual(p.plans.get("custom_monthly")?.items, [
    { feature_id: "tokens", included: 1200, reset: { interval: "month" } },
  ]);
  assert.deepEqual(p.plans.get("custom_topup")?.items, [
    {
      feature_id: "tokens",
      price: {
        amount: 3,
        billing_units: 240,
        interval: "one_off",
        billing_method: "prepaid",
      },
    },
  ]);
});

test("custom, archived and unrelated catalog entries remain byte-for-byte unchanged", async () => {
  const p = provider();
  p.features.set("credits", {
    id: "credits",
    type: "credit_system",
    archived: true,
    creditSchema: ["custom"],
  });
  p.plans.set("credits_monthly", {
    id: "credits_monthly",
    price: { amount: 37 },
    version: 8,
    archived: true,
  });
  p.plans.set("enterprise", { id: "enterprise", name: "Custom deal" });
  const before = JSON.stringify([...p.features, ...p.plans]);
  const result = await setupBilling(true, env, pricing, p.fetcher);
  assert.deepEqual(result.created, ["plans:credits_topup"]);
  p.plans.delete("credits_topup");
  assert.equal(JSON.stringify([...p.features, ...p.plans]), before);
});

test("partial failure stops writes and a later run resumes from provider state", async () => {
  const p = provider();
  const failTopup = (async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (
      String(url).endsWith("plans.create") &&
      body.plan_id === "credits_topup"
    )
      return new Response("private error", { status: 500 });
    return p.fetcher(url, init);
  }) as typeof fetch;
  await assert.rejects(
    setupBilling(true, env, pricing, failTopup),
    /Payments setup failed at plans.create/,
  );
  assert.equal(p.features.size, 1);
  assert.equal(p.plans.size, 1);
  const resumed = await setupBilling(true, env, pricing, p.fetcher);
  assert.deepEqual(resumed.created, ["plans:credits_topup"]);
  assert.equal(
    p.calls.filter((call) => call.method.endsWith(".create")).length,
    3,
  );
});

test("read errors and malformed lists are never treated as absence", async () => {
  for (const response of [
    ...[400, 401, 403, 404, 429, 500].map(
      (status) => new Response("private error", { status }),
    ),
    Response.json({}),
    Response.json({ list: [null] }),
    Response.json({ list: [{ name: "missing ID" }] }),
  ]) {
    const p = provider();
    const fetcher = (async (url, init) =>
      String(url).endsWith("plans.list")
        ? response
        : p.fetcher(url, init)) as typeof fetch;
    await assert.rejects(
      setupBilling(true, env, pricing, fetcher),
      /Payments setup/,
    );
    assert.equal(p.calls.length, 1);
    assert.equal(p.features.size, 0);
  }
});

test("uncertain create is not retried in place; next run discovers committed entry", async () => {
  for (const failure of ["network", "malformed", "unauthorized"] as const) {
    const p = provider();
    const fetcher = (async (url, init) => {
      const response = await p.fetcher(url, init);
      if (String(url).endsWith("features.create")) {
        if (failure === "network") throw new Error("private network error");
        if (failure === "unauthorized")
          return new Response("private error", { status: 401 });
        return Response.json({ unexpected: true });
      }
      return response;
    }) as typeof fetch;
    await assert.rejects(
      setupBilling(true, env, pricing, fetcher),
      /Payments setup/,
    );
    assert.equal(p.calls.length, 3);
    assert.equal(p.plans.size, 0);
    const resumed = await setupBilling(true, env, pricing, p.fetcher);
    assert.deepEqual(resumed.preserved, ["features:credits"]);
    assert.equal(resumed.created.length, 2);
  }
});

test("concurrent create conflicts fail safely and can be resumed", async () => {
  const p = provider();
  const results = await Promise.allSettled([
    setupBilling(true, env, pricing, p.fetcher),
    setupBilling(true, env, pricing, p.fetcher),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  assert.equal(p.features.size, 1);
  assert.equal(p.plans.size, 2);
  assert.deepEqual(
    (await setupBilling(true, env, pricing, p.fetcher)).created,
    [],
  );
});
