import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceId,
  balanceRequest,
  parseRevenueCatEvent,
  revenueCatConfigs,
  selectRevenueCatRoute,
  resolveRevenueCatRoute,
  parseTransfer,
  type PurchaseEvent,
} from "../disposabl-kit/server/revenuecat-contract";
import {
  receive,
  claim,
  complete,
  confirmFullRefund,
  receiveTransfer,
  recordTransferReview,
  redispatchQueued,
  createWebhook,
  webhookAuthorized,
  webhook,
  dispatchBalance,
  dispatch,
  routing,
  inspectReviewDeliveries,
} from "../disposabl-kit/server/revenuecat-functions";

import { creditQuantity } from "../disposabl-kit/payments/config";
import { paymentsEnabled } from "../disposabl-kit/features";

const config = {
  authorization: "Bearer test",
  project: "proj",
  app: "app",
  environment: "SANDBOX" as const,
  product: "topup",
  store: "APP_STORE" as const,
  autumnKey: "key",
};
const event: PurchaseEvent = {
  deliveryId: "event-1",
  project: "proj",
  app: "app",
  environment: "SANDBOX",
  store: "APP_STORE",
  product: "topup",
  customer: "user-1",
  transaction: "tx-1",
  type: "purchase",
};
const call = (fn: unknown, ctx: unknown, args: unknown): Promise<any> =>
  (fn as any)._handler(ctx, args);

// This fixture exercises mutation handlers and their scheduled operations. Convex's
// serializable mutations, not this fixture, provide transaction conflict handling.
function fixture() {
  const tables: Record<string, any[]> = {
    revenueCatPurchases: [],
    revenueCatDeliveries: [],
    revenueCatTransfers: [],
    revenueCatTransferHolds: [],
  };
  const jobs: any[] = [];
  const db = {
    normalizeId: (_table: string, id: string) =>
      id.startsWith("user-") ? id : null,
    get: async (_table: string, id: string) =>
      id.startsWith("user-") ? { _id: id } : null,
    query: (table: string) => ({
      withIndex: (_index: string, filter: (q: any) => any) => {
        const fields: Record<string, unknown> = {};
        const q = {
          eq: (name: string, value: unknown) => {
            fields[name] = value;
            return q;
          },
        };
        filter(q);
        return {
          order: (direction: string) => ({
            paginate: async (opts: {
              cursor: string | null;
              numItems: number;
            }) => {
              assert.equal(_index, "by_type");
              assert.equal(direction, "desc");
              const rows = tables[table]!.filter((row) =>
                Object.entries(fields).every(
                  ([key, value]) => row[key] === value,
                ),
              ).reverse();
              const offset = Number(opts.cursor ?? 0);
              const next = offset + opts.numItems;
              return {
                page: rows.slice(offset, next),
                isDone: next >= rows.length,
                continueCursor: String(next),
              };
            },
          }),
          take: async (n: number) =>
            tables[table]!.filter((row) =>
              Object.entries(fields).every(
                ([key, value]) => row[key] === value,
              ),
            ).slice(0, n),
          unique: async () =>
            tables[table]!.find((row) =>
              Object.entries(fields).every(
                ([key, value]) => row[key] === value,
              ),
            ) ?? null,
        };
      },
    }),
    insert: async (table: string, value: any) => {
      const id = `${table}-${tables[table]!.length}`;
      tables[table]!.push({ ...value, _id: id });
      return id;
    },
    patch: async (table: string, id: string, value: any) =>
      Object.assign(
        tables[table]!.find((row) => row._id === id),
        value,
      ),
  };
  return {
    tables,
    jobs,
    ctx: {
      db,
      scheduler: {
        runAfter: async (_delay: number, _ref: unknown, args: unknown) =>
          jobs.push(args),
      },
    },
  };
}
const scopedClaim = (balanceId: string) => ({
  balanceId,
  project: config.project,
  app: config.app,
  environment: config.environment,
  store: config.store,
  product: config.product,
});

describe("RevenueCat consumable inbox", () => {
  test("review delivery archive paginates independently of purchase state", async () => {
    const f = fixture();
    const id = await balanceId(event);
    await call(receive, f.ctx, {
      event: { ...event, type: "cancel" },
      balanceId: id,
    });
    await call(receive, f.ctx, {
      event: { ...event, deliveryId: "review-1", type: "review" },
      balanceId: id,
    });
    await call(receive, f.ctx, {
      event: { ...event, deliveryId: "review-2", type: "review" },
      balanceId: id,
    });
    assert.equal(f.tables.revenueCatPurchases![0].state, "tombstone");
    const first = await call(inspectReviewDeliveries, f.ctx, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    assert.deepEqual(
      first.page.map((row: PurchaseEvent) => row.deliveryId),
      ["review-2"],
    );
    assert.equal(first.isDone, false);
    const second = await call(inspectReviewDeliveries, f.ctx, {
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    });
    assert.deepEqual(
      second.page.map((row: PurchaseEvent) => row.deliveryId),
      ["review-1"],
    );
    assert.equal(second.isDone, true);
    const refunded = fixture();
    await call(receive, refunded.ctx, { event, balanceId: id });
    await call(claim, refunded.ctx, scopedClaim(id));
    await call(complete, refunded.ctx, { balanceId: id, kind: "grant" });
    await call(receive, refunded.ctx, {
      event: { ...event, deliveryId: "cancel", type: "cancel" },
      balanceId: id,
    });
    await call(confirmFullRefund, refunded.ctx, {
      balanceId: id,
      evidence: "case 123",
    });
    await call(claim, refunded.ctx, scopedClaim(id));
    await call(complete, refunded.ctx, { balanceId: id, kind: "refund" });
    await call(receive, refunded.ctx, {
      event: { ...event, deliveryId: "reversal", type: "review" },
      balanceId: id,
    });
    assert.equal(refunded.tables.revenueCatPurchases![0].state, "refunded");
    assert.equal(
      refunded.tables.revenueCatPurchases![0].refundEvidence,
      "case 123",
    );
    const archive = await call(inspectReviewDeliveries, refunded.ctx, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    assert.equal(archive.page[0].deliveryId, "reversal");
    await assert.rejects(
      call(inspectReviewDeliveries, f.ctx, {
        paginationOpts: { numItems: 101, cursor: null },
      }),
      /Page size/,
    );
  });
  test("managed monthly events are acknowledged only for valid, disjoint configured routes", async () => {
    const monthly = { app: "app", store: "APP_STORE", product: "monthly" };
    const env = {
      REVENUECAT_CONSUMABLE_OWNER: "custom",
      REVENUECAT_WEBHOOK_AUTH: config.authorization,
      REVENUECAT_PROJECT_ID: config.project,
      REVENUECAT_ENVIRONMENT: config.environment,
      AUTUMN_SECRET_KEY: "am_sk_test_synthetic",
      REVENUECAT_ROUTES: JSON.stringify([
        { app: "app", store: "APP_STORE", product: "topup" },
      ]),
      REVENUECAT_MANAGED_MONTHLY_ROUTES: JSON.stringify([monthly]),
    };
    const cancellation = {
      id: "private-delivery",
      type: "CANCELLATION",
      app_id: "app",
      environment: "SANDBOX",
      store: "APP_STORE",
      product_id: "monthly",
      app_user_id: "private-user",
      transaction_id: "private-transaction",
    };
    const request = (event: object, auth = config.authorization) =>
      new Request("https://example.test", {
        method: "POST",
        headers: { authorization: auth },
        body: JSON.stringify({ api_version: "1.0", event }),
      });
    const f = fixture();
    let mutations = 0;
    const ctx = {
      runMutation: (_ref: unknown, args: unknown) => {
        mutations++;
        return call(receive, f.ctx, args);
      },
    };
    const handler = createWebhook(true, env);
    for (const type of ["CANCELLATION", "INITIAL_PURCHASE", "RENEWAL"]) {
      const response = await call(
        handler,
        ctx,
        request({ ...cancellation, type }),
      );
      assert.equal(response.status, 200);
      assert.equal(await response.text(), '{"status":"ignored"}');
    }
    assert.equal(mutations, 0);
    assert.equal(f.jobs.length, 0);
    assert.ok(Object.values(f.tables).every((rows) => rows.length === 0));
    for (const change of [
      { product_id: "unknown" },
      { app_id: "other" },
      { store: "PLAY_STORE" },
      { environment: "PRODUCTION" },
      { project_id: "other" },
      { id: "" },
      { transaction_id: "" },
      { app_user_id: "$RCAnonymousID:x" },
      { original_app_user_id: "other" },
      { type: "UNKNOWN" },
      { type: "NON_RENEWING_PURCHASE" },
    ]) {
      const response = await call(
        handler,
        ctx,
        request({ ...cancellation, ...change }),
      );
      assert.equal(response.status, 400);
      assert.equal(await response.text(), "Invalid event");
    }
    assert.equal(
      (await call(handler, ctx, request(cancellation, "Bearer wrong"))).status,
      401,
    );
    assert.equal(
      (await call(createWebhook(false, env), ctx, request(cancellation)))
        .status,
      503,
    );
    for (const routes of [
      [{ ...monthly, product: "topup" }],
      [monthly, monthly],
      [{ ...monthly, store: "PLAY_STORE" }],
      [{ ...monthly, app: "other" }],
      [{ ...monthly, extra: true }],
    ]) {
      assert.equal(
        revenueCatConfigs(true, {
          ...env,
          REVENUECAT_MANAGED_MONTHLY_ROUTES: JSON.stringify(routes),
        }),
        null,
      );
      assert.equal(
        (
          await call(
            createWebhook(true, {
              ...env,
              REVENUECAT_MANAGED_MONTHLY_ROUTES: JSON.stringify(routes),
            }),
            ctx,
            request(cancellation),
          )
        ).status,
        503,
      );
    }
    assert.equal(
      revenueCatConfigs(true, {
        ...env,
        REVENUECAT_MANAGED_MONTHLY_ROUTES: "bad",
      }),
      null,
    );
    const response = await call(
      handler,
      ctx,
      request({
        ...cancellation,
        product_id: "topup",
        type: "NON_RENEWING_PURCHASE",
        app_user_id: "user-1",
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(mutations, 1);
    assert.equal(f.tables.revenueCatPurchases!.length, 1);
    assert.equal(f.tables.revenueCatDeliveries!.length, 1);
    assert.equal(f.jobs.length, 1);
  });
  test("validated routes select both stores and reject ambiguous or removed configuration", () => {
    const env = {
      REVENUECAT_CONSUMABLE_OWNER: "custom",
      REVENUECAT_WEBHOOK_AUTH: "Bearer test",
      REVENUECAT_PROJECT_ID: "proj",
      REVENUECAT_ENVIRONMENT: "SANDBOX",
      AUTUMN_SECRET_KEY: "am_sk_test_fixture",
      REVENUECAT_ROUTES: JSON.stringify([
        { app: "app", store: "APP_STORE", product: "topup" },
        { app: "android", store: "PLAY_STORE", product: "coins" },
      ]),
    };
    const configs = revenueCatConfigs(true, env)!;
    assert.equal(configs.length, 2);
    const payload = (app: string, store: string, product: string) => ({
      api_version: "1.0",
      event: {
        id: "id",
        app_id: app,
        store,
        product_id: product,
        environment: "SANDBOX",
        app_user_id: "user-1",
        transaction_id: "tx",
        type: "NON_RENEWING_PURCHASE",
      },
    });
    assert.equal(
      selectRevenueCatRoute(payload("app", "APP_STORE", "topup"), configs)?.app,
      "app",
    );
    assert.equal(
      selectRevenueCatRoute(payload("android", "PLAY_STORE", "coins"), configs)
        ?.app,
      "android",
    );
    assert.equal(
      selectRevenueCatRoute(payload("android", "APP_STORE", "coins"), configs),
      null,
    );
    assert.equal(resolveRevenueCatRoute(event, configs.slice(1)), null);
    assert.equal(
      resolveRevenueCatRoute(event, [configs[0]!, configs[0]!]),
      null,
    );
    assert.equal(
      revenueCatConfigs(true, {
        ...env,
        REVENUECAT_ROUTES: JSON.stringify([
          { app: "app", store: "APP_STORE", product: "topup" },
          { app: "app", store: "PLAY_STORE", product: "coins" },
        ]),
      }),
      null,
    );
    assert.equal(
      parseTransfer(
        {
          api_version: "1.0",
          event: {
            id: "t",
            type: "TRANSFER",
            app_id: "app",
            transferred_from: ["user-1"],
            transferred_to: ["user-2"],
          },
        },
        configs[0]!,
      ),
      null,
    );
  });
  test("sandbox and production events require matching Autumn key environments", () => {
    const env = {
      REVENUECAT_CONSUMABLE_OWNER: "custom",
      REVENUECAT_WEBHOOK_AUTH: "Bearer fixture",
      REVENUECAT_PROJECT_ID: "project",
      REVENUECAT_ROUTES: JSON.stringify([
        { app: "ios", store: "APP_STORE", product: "topup" },
      ]),
      REVENUECAT_ENVIRONMENT: "SANDBOX",
      AUTUMN_SECRET_KEY: "am_sk_test_fixture",
    };
    assert.equal(revenueCatConfigs(true, env)?.[0]?.environment, "SANDBOX");
    assert.equal(
      revenueCatConfigs(true, {
        ...env,
        AUTUMN_SECRET_KEY: "am_sk_live_fixture",
      }),
      null,
    );
    assert.equal(
      revenueCatConfigs(true, { ...env, AUTUMN_SECRET_KEY: "unknown" }),
      null,
    );
    assert.equal(
      revenueCatConfigs(true, { ...env, AUTUMN_SECRET_KEY: "am_sk_test_" }),
      null,
    );
    assert.equal(
      revenueCatConfigs(true, {
        ...env,
        AUTUMN_SECRET_KEY: "am_sk_test_bad key",
      }),
      null,
    );
    const live = { ...env, REVENUECAT_ENVIRONMENT: "PRODUCTION" };
    assert.equal(revenueCatConfigs(true, live), null);
    assert.equal(
      revenueCatConfigs(true, {
        ...live,
        AUTUMN_SECRET_KEY: "am_sk_live_fixture",
      })?.[0]?.environment,
      "PRODUCTION",
    );
  });
  test(
    "queued sandbox dispatch rechecks the current environment and key",
    { skip: !paymentsEnabled },
    async () => {
      const f = fixture();
      const id = await balanceId(event);
      await call(receive, f.ctx, { event, balanceId: id });
      assert.equal(f.tables.revenueCatPurchases![0].state, "queued");
      const env = {
        REVENUECAT_CONSUMABLE_OWNER: "custom",
        REVENUECAT_WEBHOOK_AUTH: "Bearer fixture",
        REVENUECAT_PROJECT_ID: "proj",
        REVENUECAT_ENVIRONMENT: "SANDBOX",
        REVENUECAT_ROUTES: JSON.stringify([
          { app: "app", store: "APP_STORE", product: "topup" },
        ]),
        AUTUMN_SECRET_KEY: "am_sk_test_fixture",
      };
      const previous = Object.fromEntries(
        Object.keys(env).map((key) => [key, process.env[key]]),
      );
      const originalFetch = globalThis.fetch;
      let claims = 0;
      let completions = 0;
      let requests = 0;
      const ctx = {
        runQuery: async (ref: any, args: unknown) => {
          assert.equal(ref[Symbol.for("functionName")], "revenuecat:routing");
          return call(routing, f.ctx, args);
        },
        runMutation: async (ref: any, args: unknown) => {
          const name = ref[Symbol.for("functionName")];
          if (name === "revenuecat:claim") {
            claims++;
            return call(claim, f.ctx, args);
          }
          assert.equal(name, "revenuecat:complete");
          completions++;
          return call(complete, f.ctx, args);
        },
      };
      try {
        Object.assign(process.env, env);
        globalThis.fetch = (async (url, init) => {
          requests++;
          assert.equal(url, "https://api.useautumn.com/v1/balances.create");
          assert.equal(
            new Headers(init?.headers).get("authorization"),
            "Bearer am_sk_test_fixture",
          );
          assert.deepEqual(
            JSON.parse(String(init?.body)),
            balanceRequest(event.customer, id, "grant"),
          );
          return Response.json({ success: true });
        }) as typeof fetch;
        process.env.AUTUMN_SECRET_KEY = "am_sk_live_fixture";
        await call(dispatch, ctx, { balanceId: id });
        assert.deepEqual([claims, requests, completions], [0, 0, 0]);
        assert.equal(f.tables.revenueCatPurchases![0].state, "queued");
        process.env.REVENUECAT_ENVIRONMENT = "PRODUCTION";
        await call(dispatch, ctx, { balanceId: id });
        assert.deepEqual([claims, requests, completions], [0, 0, 0]);
        assert.equal(f.tables.revenueCatPurchases![0].state, "queued");
        Object.assign(process.env, env);
        await call(dispatch, ctx, { balanceId: id });
        assert.deepEqual([claims, requests, completions], [1, 1, 1]);
        assert.equal(f.tables.revenueCatPurchases![0].state, "granted");
      } finally {
        globalThis.fetch = originalFetch;
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    },
  );
  test("transfer holds affect the other app in the same project and environment", async () => {
    const f = fixture();
    const android = {
      ...event,
      app: "android",
      store: "PLAY_STORE",
      product: "coins",
    };
    const id = await balanceId(android);
    await call(receive, f.ctx, { event: android, balanceId: id });
    await call(receiveTransfer, f.ctx, {
      project: "proj",
      app: "app",
      environment: "SANDBOX",
      deliveryId: "transfer",
      from: ["user-1"],
      to: ["user-2"],
    });
    assert.equal(
      await call(claim, f.ctx, {
        ...scopedClaim(id),
        app: "android",
        store: "PLAY_STORE",
        product: "coins",
      }),
      null,
    );
  });
  test("lost provider response and crash after success never dispatch again", async () => {
    for (const failure of ["lost response", "crash"]) {
      const f = fixture();
      const id = await balanceId(event);
      await call(receive, f.ctx, { event, balanceId: id });
      let calls = 0;
      const fetcher = (async () => {
        calls++;
        if (failure === "lost response")
          throw new Error("connection lost after commit");
        return Response.json({ success: true });
      }) as typeof fetch;
      const claimOperation = (scope: unknown) => call(claim, f.ctx, scope);
      const completeOperation = () => {
        throw new Error("worker crashed");
      };
      await dispatchBalance(
        config,
        id,
        claimOperation,
        completeOperation,
        fetcher,
      );
      await dispatchBalance(
        config,
        id,
        claimOperation,
        completeOperation,
        fetcher,
      );
      assert.equal(calls, 1);
      assert.equal(f.tables.revenueCatPurchases![0].state, "grant_unknown");
    }
  });
  test(
    "payments-off starter rejects webhook before any mutation",
    { skip: paymentsEnabled },
    async () => {
      const response = await call(
        webhook,
        {
          runMutation: () => {
            throw new Error("unexpected mutation");
          },
        },
        new Request("https://example.test/revenuecat/webhook", {
          method: "POST",
        }),
      );
      assert.equal(response.status, 503);
    },
  );
  test("webhook acknowledges durable purchases and transfer holds with HTTP 200", async () => {
    const handler = createWebhook(true, {
      REVENUECAT_CONSUMABLE_OWNER: "custom",
      REVENUECAT_WEBHOOK_AUTH: config.authorization,
      REVENUECAT_PROJECT_ID: config.project,
      REVENUECAT_ENVIRONMENT: config.environment,
      AUTUMN_SECRET_KEY: "am_sk_test_synthetic",
      REVENUECAT_ROUTES: JSON.stringify([
        { app: config.app, store: config.store, product: config.product },
      ]),
    });
    const purchase = {
      id: "delivery",
      type: "NON_RENEWING_PURCHASE",
      app_id: config.app,
      environment: config.environment,
      store: config.store,
      product_id: config.product,
      app_user_id: "user-1",
      transaction_id: "transaction",
    };
    const request = (event: object) =>
      new Request("https://example.test/revenuecat/webhook", {
        method: "POST",
        headers: { authorization: config.authorization },
        body: JSON.stringify({ api_version: "1.0", event }),
      });
    for (const event of [
      purchase,
      {
        ...purchase,
        type: "TRANSFER",
        transferred_from: ["user-1"],
        transferred_to: ["user-2"],
      },
    ]) {
      let enter!: () => void;
      let persist!: (value: string) => void;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const persisted = new Promise<string>((resolve) => {
        persist = resolve;
      });
      let acknowledged = false;
      const result = call(
        handler,
        {
          runMutation: () => {
            enter();
            return persisted;
          },
        },
        request(event),
      ).then((response: Response) => {
        acknowledged = true;
        return response;
      });
      await entered;
      assert.equal(acknowledged, false);
      persist("pending");
      const response = await result;
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        status: event.type === "TRANSFER" ? "operator_review" : "pending",
      });
      await assert.rejects(
        call(
          handler,
          {
            runMutation: async () => {
              throw new Error("persistence failed");
            },
          },
          request(event),
        ),
        /persistence failed/,
      );
    }
    const f = fixture();
    const ctx = {
      runMutation: (_ref: unknown, args: unknown) => call(receive, f.ctx, args),
    };
    assert.equal((await call(handler, ctx, request(purchase))).status, 200);
    assert.equal((await call(handler, ctx, request(purchase))).status, 200);
    assert.equal(f.tables.revenueCatPurchases!.length, 1);
    assert.equal(f.tables.revenueCatDeliveries!.length, 1);
    assert.equal(
      (
        await call(
          handler,
          ctx,
          request({ ...purchase, environment: "PRODUCTION" }),
        )
      ).status,
      400,
    );
    assert.equal(
      (await call(handler, ctx, new Request("https://example.test"))).status,
      401,
    );
  });
  test("webhook authorization requires the exact configured header", async () => {
    assert.equal(
      await webhookAuthorized(
        new Request("https://example.test"),
        config.authorization,
      ),
      false,
    );
    assert.equal(
      await webhookAuthorized(
        new Request("https://example.test", {
          headers: { authorization: "Bearer wrong" },
        }),
        config.authorization,
      ),
      false,
    );
    assert.equal(
      await webhookAuthorized(
        new Request("https://example.test", {
          headers: { authorization: config.authorization },
        }),
        config.authorization,
      ),
      true,
    );
  });
  test("transfer holds only affected customers until operator review", async () => {
    const f = fixture();
    const id = await balanceId(event);
    await call(receive, f.ctx, { event, balanceId: id });
    const transfer = {
      project: "proj",
      app: "app",
      environment: "SANDBOX",
      deliveryId: "transfer",
      from: ["user-1"],
      to: ["user-2"],
    };
    await call(receiveTransfer, f.ctx, transfer);
    await call(receiveTransfer, f.ctx, transfer);
    assert.equal(await call(claim, f.ctx, scopedClaim(id)), null);
    const other = {
      ...event,
      customer: "user-3",
      transaction: "other",
      deliveryId: "other",
    };
    const otherId = await balanceId(other);
    await call(receive, f.ctx, { event: other, balanceId: otherId });
    assert.equal(
      (await call(claim, f.ctx, scopedClaim(otherId))).kind,
      "grant",
    );
  });
  test("transfer review is scoped, idempotent and retains holds; redispatch is targeted", async () => {
    const f = fixture();
    const id = await balanceId(event);
    await call(receive, f.ctx, { event, balanceId: id });
    const transfer = {
      project: "proj",
      app: "app",
      environment: "SANDBOX",
      deliveryId: "transfer",
      from: ["user-1"],
      to: ["user-2"],
    };
    await call(receiveTransfer, f.ctx, transfer);
    await call(receiveTransfer, f.ctx, { ...transfer, deliveryId: "second" });
    const review = { ...transfer, evidence: " provider case 123 " };
    assert.equal(
      await call(recordTransferReview, f.ctx, { ...review, app: "wrong" }),
      false,
    );
    assert.equal(
      await call(recordTransferReview, f.ctx, { ...review, to: ["user-3"] }),
      false,
    );
    await assert.rejects(
      call(recordTransferReview, f.ctx, { ...review, evidence: " " }),
      /Provider evidence/,
    );
    await assert.rejects(
      call(recordTransferReview, f.ctx, {
        ...review,
        evidence: "x".repeat(1001),
      }),
      /Provider evidence/,
    );
    assert.equal(await call(recordTransferReview, f.ctx, review), true);
    const saved = f.tables.revenueCatTransfers![0].review;
    assert.equal(saved.decision, "retain_hold");
    assert.equal(saved.evidence, "provider case 123");
    assert.equal(typeof saved.reviewedAt, "number");
    assert.equal(await call(recordTransferReview, f.ctx, review), true);
    assert.equal(
      await call(recordTransferReview, f.ctx, {
        ...review,
        evidence: "different",
      }),
      false,
    );
    assert.deepEqual(f.tables.revenueCatTransfers![0].review, saved);
    await call(receiveTransfer, f.ctx, transfer);
    assert.ok(f.tables.revenueCatTransferHolds!.every((hold) => hold.active));
    const target = { ...scopedClaim(id), customer: event.customer };
    const jobs = f.jobs.length;
    assert.equal(await call(redispatchQueued, f.ctx, target), false);
    assert.equal(await call(claim, f.ctx, scopedClaim(id)), null);
    assert.equal(f.jobs.length, jobs);
    // Simulate independently reconciled holds to exercise redispatch without defining a release policy.
    f.tables.revenueCatTransferHolds!.forEach((hold) => {
      hold.active = false;
    });
    assert.equal(
      await call(redispatchQueued, f.ctx, { ...target, customer: "user-2" }),
      false,
    );
    assert.equal(
      await call(redispatchQueued, f.ctx, { ...target, product: "wrong" }),
      false,
    );
    assert.equal(await call(redispatchQueued, f.ctx, target), true);
    assert.equal(f.jobs.length, jobs + 1);
    await call(receiveTransfer, f.ctx, { ...transfer, deliveryId: "third" });
    assert.equal(await call(claim, f.ctx, scopedClaim(id)), null);
    f.tables.revenueCatTransferHolds!.forEach((hold) => {
      hold.active = false;
    });
    assert.equal((await call(claim, f.ctx, scopedClaim(id))).kind, "grant");
    assert.equal(await call(redispatchQueued, f.ctx, target), false);
  });
  test("disabled and incomplete configuration cannot read or dispatch payments", () => {
    assert.equal(revenueCatConfigs(false, {}), null);
    assert.equal(
      revenueCatConfigs(true, { REVENUECAT_CONSUMABLE_OWNER: "custom" }),
      null,
    );
  });
  test("validates scope, customer and transaction without trusting a client", () => {
    const payload = {
      api_version: "1.0",
      event: {
        id: "id",
        app_id: "app",
        app_user_id: "user-1",
        original_app_user_id: "user-1",
        transaction_id: "t",
        product_id: "topup",
        environment: "SANDBOX",
        store: "APP_STORE",
        type: "NON_RENEWING_PURCHASE",
      },
    };
    assert.equal(parseRevenueCatEvent(payload, config)?.type, "purchase");
    for (const change of [
      { app_id: "other" },
      { environment: "PRODUCTION" },
      { product_id: "other" },
      { store: "PLAY_STORE" },
      { transaction_id: "" },
      { app_user_id: "$RCAnonymousID:x" },
      { original_app_user_id: "user-2" },
      { project_id: "other" },
    ]) {
      assert.equal(
        parseRevenueCatEvent(
          { ...payload, event: { ...payload.event, ...change } },
          config,
        ),
        null,
      );
    }
  });
  test("replays and account switches cannot create another grant; different transactions can", async () => {
    const f = fixture();
    const id = await balanceId(event);
    await call(receive, f.ctx, { event, balanceId: id });
    await call(receive, f.ctx, { event, balanceId: id });
    await call(receive, f.ctx, {
      event: { ...event, deliveryId: "event-2" },
      balanceId: id,
    });
    assert.equal(
      await call(receive, f.ctx, {
        event: { ...event, deliveryId: "event-3", customer: "user-2" },
        balanceId: id,
      }),
      "operator_review",
    );
    const second = { ...event, deliveryId: "event-4", transaction: "tx-2" };
    await call(receive, f.ctx, {
      event: second,
      balanceId: await balanceId(second),
    });
    assert.equal(f.tables.revenueCatPurchases!.length, 2);
    assert.equal(f.jobs.length, 2);
    assert.deepEqual(balanceRequest(event.customer, id, "grant"), {
      customer_id: event.customer,
      feature_id: "credits",
      balance_id: id,
      included_grant: creditQuantity("topup"),
    });
    assert.notEqual(await balanceId(event), await balanceId(second));
  });
  test("dispatch claim survives response loss or worker crash and cannot be claimed twice", async () => {
    const f = fixture();
    const id = await balanceId(event);
    await call(receive, f.ctx, { event, balanceId: id });
    assert.equal(
      await call(claim, f.ctx, {
        ...scopedClaim(id),
        environment: "PRODUCTION",
      }),
      null,
    );
    assert.deepEqual(await call(claim, f.ctx, scopedClaim(id)), {
      customer: event.customer,
      kind: "grant",
    });
    await call(receive, f.ctx, {
      event: { ...event, deliveryId: "retry" },
      balanceId: id,
    });
    assert.equal(await call(claim, f.ctx, scopedClaim(id)), null);
    assert.equal(f.tables.revenueCatPurchases![0].state, "grant_unknown");
    await call(complete, f.ctx, { balanceId: id, kind: "grant" });
    assert.equal(f.tables.revenueCatPurchases![0].state, "granted");
  });
  test("refund ordering prevents a late grant and holds granted refunds for review", async () => {
    const f = fixture();
    const id = await balanceId(event);
    await call(receive, f.ctx, {
      event: { ...event, type: "cancel" },
      balanceId: id,
    });
    await call(receive, f.ctx, {
      event: { ...event, deliveryId: "purchase" },
      balanceId: id,
    });
    assert.equal(await call(claim, f.ctx, scopedClaim(id)), null);
    assert.equal(f.tables.revenueCatPurchases![0].state, "tombstone");
    const g = fixture();
    await call(receive, g.ctx, { event, balanceId: id });
    await call(claim, g.ctx, scopedClaim(id));
    await call(receive, g.ctx, {
      event: { ...event, deliveryId: "cancel", type: "cancel" },
      balanceId: id,
    });
    await call(complete, g.ctx, { balanceId: id, kind: "grant" });
    assert.equal(g.tables.revenueCatPurchases![0].state, "refund_review");
    assert.equal(
      await call(confirmFullRefund, g.ctx, {
        balanceId: id,
        evidence: "provider case 1",
      }),
      true,
    );
    assert.deepEqual(await call(claim, g.ctx, scopedClaim(id)), {
      customer: event.customer,
      kind: "refund",
    });
    assert.deepEqual(balanceRequest(event.customer, id, "refund"), {
      customer_id: event.customer,
      feature_id: "credits",
      balance_id: id,
      remaining: 0,
    });
    assert.equal(await call(claim, g.ctx, scopedClaim(id)), null);
    assert.equal(g.tables.revenueCatPurchases![0].state, "refund_unknown");
    await call(receive, g.ctx, {
      event: { ...event, deliveryId: "refund-replay", type: "cancel" },
      balanceId: id,
    });
    assert.equal(await call(claim, g.ctx, scopedClaim(id)), null);
    assert.equal(g.tables.revenueCatPurchases![0].state, "refund_unknown");
  });
});
