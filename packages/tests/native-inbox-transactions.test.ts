import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  balanceId,
  type PurchaseEvent,
} from "../disposabl-kit/server/revenuecat-contract";

const url = process.env.NATIVE_INBOX_FIXTURE_URL;
if (url && !["http://127.0.0.1:3490", "http://localhost:3490"].includes(url))
  throw new Error(
    "Native inbox fixture requires the isolated loopback deployment on port 3490",
  );
async function call(name: string, args: object, query = false): Promise<any> {
  const response = await fetch(`${url}/api/${query ? "query" : "mutation"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: `fixture:${name}`, args, format: "json" }),
  });
  const result = (await response.json()) as any;
  if (result.status !== "success")
    throw new Error(result.errorMessage ?? JSON.stringify(result));
  return result.value;
}
const user = () => call("user", { label: randomUUID() });
const event = (
  customer: string,
  transaction = randomUUID(),
): PurchaseEvent => ({
  deliveryId: randomUUID(),
  project: "project",
  app: "apple",
  environment: "SANDBOX",
  store: "APP_STORE",
  product: "apple-coins",
  customer,
  transaction,
  type: "purchase",
});
const deliver = async (e: PurchaseEvent) =>
  call("deliver", { event: e, balanceId: await balanceId(e) });
const scope = (e: PurchaseEvent, id: string) => ({
  balanceId: id,
  project: e.project,
  app: e.app,
  environment: e.environment,
  store: e.store,
  product: e.product,
});
const state = (id: string) => call("state", { balanceId: id }, true);
const evidence = "fixture provider record";

async function awaitControl(
  balanceId: string,
  predicate: (row: any) => boolean,
) {
  for (let i = 0; i < 200; i++) {
    const row = await call("controlState", { balanceId }, true);
    if (predicate(row)) return row;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for fixture worker");
}

for (const scenario of ["new hold", "deleted customer", "success"] as const) {
  test(
    `scheduled production worker: ${scenario} before claim`,
    { skip: !url },
    async () => {
      const [alice, bob] = await Promise.all([user(), user()]);
      const purchase = event(alice),
        id = await balanceId(purchase);
      await call("controlCreate", { balanceId: id });
      await deliver(purchase);
      await awaitControl(id, (row) => row.finished === 1);
      assert.equal((await state(id)).purchase.state, "queued");
      await call("controlSet", {
        balanceId: id,
        enabled: true,
        released: false,
      });
      assert.equal(
        await call("retryQueued", { ...scope(purchase, id), customer: alice }),
        true,
      );
      await awaitControl(id, (row) => row.arrived === 1);
      if (scenario === "new hold") {
        await call("transfer", {
          project: purchase.project,
          app: purchase.app,
          environment: purchase.environment,
          deliveryId: randomUUID(),
          from: [alice],
          to: [bob],
        });
      } else if (scenario === "deleted customer") {
        await call("deleteUser", { id: alice });
      }
      await call("controlSet", {
        balanceId: id,
        enabled: true,
        released: true,
      });
      const done = await awaitControl(id, (row) => row.finished === 2);
      assert.equal(done.claimAttempts, 1);
      assert.equal(done.providerCalls, scenario === "success" ? 1 : 0);
      assert.equal(
        done.providerCustomer,
        scenario === "success" ? alice : undefined,
      );
      assert.equal(
        (await state(id)).purchase.state,
        scenario === "success" ? "granted" : "queued",
      );
    },
  );
}

test(
  "concurrent transfer reviews retain all holds and reject stale decisions",
  { skip: !url },
  async () => {
    const [alice, bob] = await Promise.all([user(), user()]);
    const purchase = event(alice),
      id = await balanceId(purchase);
    await deliver(purchase);
    const transfer = {
      project: purchase.project,
      app: purchase.app,
      environment: purchase.environment,
      deliveryId: randomUUID(),
      from: [alice],
      to: [bob],
    };
    const second = { ...transfer, deliveryId: randomUUID() };
    await Promise.all([call("transfer", transfer), call("transfer", second)]);
    const review = { ...transfer, evidence };
    const results = await Promise.all(
      Array.from({ length: 12 }, () => call("reviewTransfer", review)),
    );
    assert.ok(results.every(Boolean));
    assert.equal(
      await call("reviewTransfer", { ...review, evidence: "different" }),
      false,
    );
    assert.equal(
      await call("reviewTransfer", { ...review, to: [alice] }),
      false,
    );
    const lookup = {
      project: transfer.project,
      app: transfer.app,
      environment: transfer.environment,
      deliveryId: transfer.deliveryId,
      customer: alice,
    };
    const saved = await call("transferState", lookup, true);
    assert.equal(saved.transfer.review.evidence, evidence);
    assert.equal(saved.transfer.review.decision, "retain_hold");
    assert.equal(saved.holds.length, 2);
    assert.equal(
      await call("retryQueued", { ...scope(purchase, id), customer: alice }),
      false,
    );
    assert.equal(await call("take", scope(purchase, id)), null);
    await call("transfer", transfer);
    assert.equal((await call("transferState", lookup, true)).holds.length, 2);
    assert.equal((await state(id)).purchase.state, "queued");
  },
);

test(
  "real Convex serializes duplicate Apple deliveries and preserves ownership",
  { skip: !url },
  async () => {
    const [alice, bob] = await Promise.all([user(), user()]);
    const e = event(alice),
      id = await balanceId(e);
    const replies = await Promise.all(
      Array.from({ length: 16 }, () => deliver(e)),
    );
    assert.ok(replies.every((value) => value === "pending"));
    let s = await state(id);
    assert.equal(s.deliveries.length, 1);
    assert.equal(s.purchase.customer, alice);
    assert.equal(s.purchase.state, "queued");
    const conflict = { ...e, deliveryId: randomUUID(), customer: bob };
    assert.equal(await deliver(conflict), "operator_review");
    s = await state(id);
    assert.equal(s.deliveries.filter((row: any) => row.conflict).length, 1);
    assert.equal(s.purchase.customer, alice);
    const claims = await Promise.all(
      Array.from({ length: 12 }, () => call("take", scope(e, id))),
    );
    assert.equal(claims.filter(Boolean).length, 1);
    assert.deepEqual(claims.find(Boolean), { customer: alice, kind: "grant" });
    assert.equal((await state(id)).purchase.state, "grant_unknown");
    assert.equal(
      await call("retryQueued", { ...scope(e, id), customer: alice }),
      false,
    );
    assert.equal(await deliver({ ...e, deliveryId: randomUUID() }), "pending");
    assert.equal(await call("take", scope(e, id)), null);
    assert.equal(
      await call("reconcile", {
        balanceId: id,
        kind: "grant",
        evidence: "",
      }).then(
        () => false,
        () => true,
      ),
      true,
    );
    assert.equal(
      await call("reconcile", { balanceId: id, kind: "grant", evidence }),
      true,
    );
    assert.equal((await state(id)).purchase.state, "granted");
    assert.equal(
      await call("reconcile", { balanceId: id, kind: "grant", evidence }),
      false,
    );
    assert.equal(await call("take", scope(e, id)), null);
  },
);

test(
  "concurrent cross-user deliveries retain one owner and quarantine the other",
  { skip: !url },
  async () => {
    const [alice, bob] = await Promise.all([user(), user()]);
    const first = event(alice),
      second = { ...first, customer: bob, deliveryId: randomUUID() };
    const outcomes = await Promise.all([deliver(first), deliver(second)]);
    assert.deepEqual(outcomes.sort(), ["operator_review", "pending"]);
    const id = await balanceId(first),
      s = await state(id);
    assert.equal(s.deliveries.length, 2);
    assert.equal(s.deliveries.filter((row: any) => row.conflict).length, 1);
    const winner = s.deliveries.find((row: any) => !row.conflict);
    assert.equal(s.purchase.customer, winner.customer);
    assert.notEqual(
      s.purchase.customer,
      s.deliveries.find((row: any) => row.conflict).customer,
    );
  },
);

test(
  "real Convex fences early and late refunds and reconciles unknown writes",
  { skip: !url },
  async () => {
    const alice = await user();
    const early = event(alice),
      earlyId = await balanceId(early);
    assert.equal(
      await deliver({ ...early, type: "cancel" }),
      "operator_review",
    );
    await deliver({ ...early, deliveryId: randomUUID() });
    assert.equal((await state(earlyId)).purchase.state, "tombstone");
    assert.equal(await call("take", scope(early, earlyId)), null);

    const late = event(alice),
      id = await balanceId(late);
    await deliver(late);
    assert.equal((await call("take", scope(late, id))).kind, "grant");
    await deliver({ ...late, type: "cancel", deliveryId: randomUUID() });
    assert.equal((await state(id)).purchase.refundPending, true);
    assert.equal(await call("take", scope(late, id)), null);
    assert.equal(
      await call("reconcile", { balanceId: id, kind: "grant", evidence }),
      true,
    );
    assert.equal((await state(id)).purchase.state, "refund_review");
    assert.equal(
      await call("approveRefund", { balanceId: id, evidence }),
      true,
    );
    const claims = await Promise.all(
      Array.from({ length: 8 }, () => call("take", scope(late, id))),
    );
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(claims.find(Boolean).kind, "refund");
    assert.equal((await state(id)).purchase.state, "refund_unknown");
    await deliver({ ...late, deliveryId: randomUUID(), type: "cancel" });
    assert.equal(await call("take", scope(late, id)), null);
    assert.equal(
      await call("reconcile", { balanceId: id, kind: "refund", evidence }),
      true,
    );
    assert.equal((await state(id)).purchase.state, "refunded");
    assert.equal(await call("take", scope(late, id)), null);

    const granted = event(alice),
      grantedId = await balanceId(granted);
    await deliver(granted);
    assert.equal((await call("take", scope(granted, grantedId))).kind, "grant");
    await call("finish", { balanceId: grantedId, kind: "grant" });
    assert.equal((await state(grantedId)).purchase.state, "granted");
    await deliver({ ...granted, type: "cancel", deliveryId: randomUUID() });
    assert.equal((await state(grantedId)).purchase.state, "refund_review");
    assert.equal(await call("take", scope(granted, grantedId)), null);
  },
);

test(
  "local route selection isolates stores and rejects absent or ambiguous routes",
  { skip: !url },
  async () => {
    const routes = [
      { app: "apple", store: "APP_STORE", product: "apple-coins" },
      { app: "google", store: "PLAY_STORE", product: "google-coins" },
    ];
    const payload = (r: (typeof routes)[number]) => ({
      api_version: "1.0",
      event: {
        id: "event",
        type: "NON_RENEWING_PURCHASE",
        app_id: r.app,
        store: r.store,
        product_id: r.product,
        environment: "SANDBOX",
        app_user_id: "customer",
        transaction_id: "transaction",
      },
    });
    const identity = (r: (typeof routes)[number]) => ({
      ...r,
      project: "project",
      environment: "SANDBOX",
    });
    const route = (
      list: unknown,
      r: (typeof routes)[number],
      id = identity(r),
    ) =>
      call(
        "route",
        { routes: JSON.stringify(list), event: payload(r), identity: id },
        true,
      );
    assert.deepEqual(await route(routes, routes[0]!), {
      selected: "apple",
      resolved: "apple",
    });
    assert.deepEqual(await route(routes, routes[1]!), {
      selected: "google",
      resolved: "google",
    });
    assert.deepEqual(await route([routes[1]], routes[0]!), {
      selected: null,
      resolved: null,
    });
    assert.equal(await route([routes[0], routes[0]], routes[0]!), null);
    assert.deepEqual(
      await route(routes, { ...routes[0]!, store: "PLAY_STORE" }),
      { selected: null, resolved: null },
    );
    const alice = await user(),
      apple = event(alice),
      google = {
        ...apple,
        app: "google",
        store: "PLAY_STORE",
        product: "google-coins",
        deliveryId: randomUUID(),
      };
    const appleId = await balanceId(apple),
      googleId = await balanceId(google);
    assert.notEqual(appleId, googleId);
    await Promise.all([deliver(apple), deliver(google)]);
    assert.equal(await call("take", scope(google, appleId)), null);
    assert.equal((await call("take", scope(apple, appleId))).kind, "grant");
    assert.equal((await call("take", scope(google, googleId))).kind, "grant");
  },
);

test(
  "payments toggle recovery preserves and targets one queued grant",
  {
    skip: !url || !process.env.NATIVE_INBOX_RECOVERY_PHASE,
  },
  async () => {
    const path = process.env.NATIVE_INBOX_RECOVERY_FILE!;
    if (process.env.NATIVE_INBOX_RECOVERY_PHASE === "off") {
      const customer = await user();
      const purchase = event(customer),
        id = await balanceId(purchase);
      await call("controlCreate", { balanceId: id });
      await call("controlSet", {
        balanceId: id,
        enabled: true,
        released: true,
      });
      await deliver(purchase);
      const done = await awaitControl(id, (row) => row.finished === 1);
      assert.equal(done.claimAttempts, 0);
      assert.equal(done.providerCalls, 0);
      assert.equal((await state(id)).purchase.state, "queued");
      writeFileSync(path, JSON.stringify({ purchase, id }));
      return;
    }
    const { purchase, id } = JSON.parse(readFileSync(path, "utf8"));
    assert.equal((await state(id)).purchase.state, "queued");
    const target = { ...scope(purchase, id), customer: purchase.customer };
    await call("controlSet", { balanceId: id, enabled: true, released: false });
    assert.equal(await call("retryQueued", target), true);
    assert.equal(await call("retryQueued", target), true);
    await awaitControl(id, (row) => row.arrived === 3);
    await call("controlSet", { balanceId: id, enabled: true, released: true });
    const done = await awaitControl(id, (row) => row.finished === 3);
    assert.equal(done.claimAttempts, 2);
    assert.equal(done.providerCalls, 1);
    assert.equal(done.providerCustomer, purchase.customer);
    assert.equal((await state(id)).purchase.state, "granted");
    assert.equal(await call("retryQueued", target), false);
    assert.equal(await call("take", scope(purchase, id)), null);
    assert.equal(
      (await call("controlState", { balanceId: id }, true)).providerCalls,
      1,
    );
  },
);
