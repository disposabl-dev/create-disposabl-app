import { test } from "node:test";
import assert from "node:assert/strict";
import {
  beginAttempt,
  finishAttempt,
  hasUnknownAttempt,
  hasPendingMonthlyAttempt,
  resolveAttempt,
} from "../disposabl-kit/server/billing-functions";

test("uncertain checkout persists and prevents replay without blocking a different purchase", async () => {
  const rows: {
    _id: string;
    userId: string;
    purchase: string;
    requestId: string;
    url?: string;
    resolvedAt?: number;
  }[] = [];
  const ctx = {
    db: {
      query: () => ({
        withIndex: (_: string, filter: (q: any) => any) => {
          const fields: Record<string, string | undefined> = {};
          const q = {
            eq: (key: string, value: string | undefined) => {
              fields[key] = value;
              return q;
            },
          };
          filter(q);
          const matches = () =>
            rows.filter((row) =>
              Object.entries(fields).every(
                ([key, value]) => (row as any)[key] === value,
              ),
            );
          return {
            unique: async () => matches()[0] ?? null,
            first: async () => matches()[0] ?? null,
          };
        },
      }),
      insert: async (_: string, row: any) => {
        rows.push({ ...row, _id: String(rows.length + 1) });
      },
      patch: async (_: string, id: string, value: { url: string }) => {
        Object.assign(
          rows.find((row) => row._id === id)!,
          value,
        );
      },
    },
  };
  const begin = (purchase: string, requestId: string) =>
    (beginAttempt as any)._handler(ctx, {
      userId: "alice",
      purchase,
      requestId,
    });
  const pending = () =>
    (hasUnknownAttempt as any)._handler(ctx, { userId: "alice" });
  const monthlyPending = (userId = "alice") =>
    (hasPendingMonthlyAttempt as any)._handler(ctx, { userId });
  assert.equal(await monthlyPending(), false);
  assert.equal(await begin("monthly", "one"), null);
  assert.equal(await monthlyPending(), true);
  assert.equal(await monthlyPending("bob"), false);
  await assert.rejects(begin("monthly", "one"), /review/);
  await assert.rejects(begin("monthly", "two"), /review/);
  assert.equal(await begin("topup", "three"), null);
  assert.equal(await pending(), true);
  await (finishAttempt as any)._handler(ctx, {
    userId: "alice",
    purchase: "topup",
    requestId: "three",
    url: "https://checkout.example/three",
  });
  assert.equal(await pending(), true);
  await (finishAttempt as any)._handler(ctx, {
    userId: "alice",
    purchase: "monthly",
    requestId: "one",
    url: "https://checkout.example/one",
  });
  assert.equal(await pending(), false);
  assert.equal(await monthlyPending(), true);
  assert.equal(await begin("monthly", "one"), "https://checkout.example/one");
  assert.equal(await begin("monthly", "two"), "https://checkout.example/one");
  assert.equal(
    await begin("monthly", "another-device"),
    "https://checkout.example/one",
  );
  assert.equal(rows.filter((row) => row.purchase === "monthly").length, 1);
  await assert.rejects(
    (resolveAttempt as any)._handler(ctx, {
      userId: "alice",
      requestId: "one",
      outcome: "not_charged",
      evidence: "Still a payable checkout link",
    }),
    /completed, cancelled or expired/,
  );
  await (resolveAttempt as any)._handler(ctx, {
    userId: "alice",
    requestId: "one",
    outcome: "cancelled",
    evidence: "Provider fixture confirms checkout cancellation",
  });
  assert.ok(rows[0].resolvedAt);
  assert.equal(await monthlyPending(), false);
  assert.deepEqual(await begin("monthly", "one"), { retryAllowed: true });
  assert.equal(rows.length, 2);
  assert.equal(await begin("monthly", "two"), null);
  await assert.rejects(begin("topup", "one"), /review/);
});

test("browser retains unknown checkout identity and releases only a confirmed closed attempt", async () => {
  const { requestCheckout } =
    await import("../disposabl-kit/payments/checkout-attempt");
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const ids: string[] = [];
  let serial = 0;
  const run = (result: "unknown" | "closed" | "url" | "pending") =>
    requestCheckout(
      storage,
      "alice",
      "monthly",
      async ({ requestId }) => {
        ids.push(requestId);
        if (result === "unknown") throw new Error("Response lost");
        if (result === "closed") return { url: null, retryAllowed: true };
        return {
          url: result === "url" ? "https://checkout.example/new" : null,
        };
      },
      () => String(++serial),
    );
  await assert.rejects(run("unknown"), /Response lost/);
  await run("pending");
  await run("closed");
  assert.deepEqual(ids, ["1", "1", "1"]);
  assert.equal(values.size, 0);
  await run("url");
  assert.deepEqual(ids, ["1", "1", "1", "2"]);
  assert.equal(values.size, 0);
});
