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
  webhookAuthorized,
  webhook,
  dispatchBalance,
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
