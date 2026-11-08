import { test } from "node:test";
import assert from "node:assert/strict";
import { redeem, cleanup } from "../disposabl-kit/server/billing-handoff";

test("billing handoff expires and a redeemed link cannot be replayed", async () => {
  let row: any = {
    _id: "one",
    userId: "alice",
    sessionId: "session",
    purchase: "topup",
    expiresAt: Date.now() + 120_000,
  };
  let exchanges = 0;
  const ctx = {
    db: {
      query: () => ({ withIndex: () => ({ unique: async () => row }) }),
      delete: async () => {
        row = null;
      },
    },
    runMutation: async () => {
      exchanges++;
      return { userId: "alice" };
    },
  };
  const code = "Q".repeat(43);
  const expiresAt = row.expiresAt;
  assert.deepEqual(await (redeem as any)._handler(ctx, { code }), {
    userId: "alice",
    purchase: "topup",
    expiresAt,
  });
  await assert.rejects((redeem as any)._handler(ctx, { code }), /expired/);
  assert.equal(exchanges, 1);
  row = {
    _id: "two",
    userId: "alice",
    sessionId: "session",
    expiresAt: Date.now() - 1,
  };
  await assert.rejects((redeem as any)._handler(ctx, { code }), /expired/);
  await (cleanup as any)._handler(ctx, { hash: "hash" });
  assert.equal(row, null);
});

test("pricing requires the redeemed selection and matching account for iOS", async () => {
  const { handoffSelection, handoffAllows } =
    await import("../disposabl-kit/payments/checkout-attempt");
  assert.equal(
    handoffAllows(true, handoffSelection(null), "alice", "topup"),
    false,
  );
  assert.equal(
    handoffAllows(true, handoffSelection("1"), "alice", "topup"),
    false,
  );
  const selection = handoffSelection(
    JSON.stringify({
      userId: "alice",
      purchase: "topup",
      expiresAt: Date.now() + 120000,
    }),
  );
  assert.equal(handoffAllows(true, selection, "alice", "topup"), true);
  assert.equal(handoffAllows(true, selection, "bob", "topup"), false);
  assert.equal(handoffAllows(true, selection, "alice", "monthly"), false);
  assert.equal(handoffAllows(false, null, "alice", "topup"), true);
  assert.equal(
    handoffSelection(
      JSON.stringify({
        userId: "alice",
        purchase: "topup",
        expiresAt: Date.now() - 1,
      }),
    ),
    null,
  );
});

test("expired iOS selection stays restricted on a query-free pricing return", async () => {
  const { handoffContext, handoffAllows } =
    await import("../disposabl-kit/payments/checkout-attempt");
  const stored = JSON.stringify({
    userId: "alice",
    purchase: "topup",
    expiresAt: Date.now() - 1,
  });
  for (const value of [stored, "broken json", "1", "", "null"]) {
    const returned = handoffContext(value, "");
    assert.equal(returned.fromIos, true);
    assert.equal(returned.handoff, null);
    for (const purchase of ["monthly", "topup"] as const)
      assert.equal(
        handoffAllows(returned.fromIos, returned.handoff, "alice", purchase),
        false,
      );
  }
  const renewed = handoffContext(
    JSON.stringify({
      userId: "alice",
      purchase: "topup",
      expiresAt: Date.now() + 120000,
    }),
    "",
  );
  assert.equal(
    handoffAllows(renewed.fromIos, renewed.handoff, "alice", "topup"),
    true,
  );
  assert.equal(
    handoffAllows(renewed.fromIos, renewed.handoff, "alice", "monthly"),
    false,
  );
  assert.equal(handoffContext(null, "").fromIos, false);
  assert.equal(handoffContext(null, "?source=ios").fromIos, true);
});
