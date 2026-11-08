import { test } from "node:test";
import assert from "node:assert/strict";
import {
  redeem,
  cleanup,
  returnTarget,
} from "../disposabl-kit/server/billing-handoff";

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
    returnClaim: null,
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

test("return target is bound to a redeemed browser session and an allowlisted channel", async () => {
  const previous = process.env.BILLING_IOS_RETURN_CHANNELS;
  process.env.BILLING_IOS_RETURN_CHANNELS = "production,preview";
  const code = "Q".repeat(43);
  const expiresAt = Date.now() + 120_000;
  let row: any = {
    _id: "one",
    userId: "alice",
    sessionId: "source",
    purchase: "topup",
    expiresAt,
    returnChannel: "preview",
    returnExpiresAt: Date.now() + 300_000,
  };
  let identity: any = { subject: "browser" };
  let owner = "alice";
  const accessToken = `x.${btoa(JSON.stringify({ sub: "browser" }))}.x`;
  const ctx: any = {
    auth: { getUserIdentity: async () => identity },
    db: {
      query: () => ({ withIndex: () => ({ unique: async () => row }) }),
      patch: async (_table: string, _id: string, value: object) =>
        Object.assign(row, value),
      delete: async () => {
        row = null;
      },
    },
    runQuery: async () => ({ userId: owner }),
    runMutation: async () => ({ userId: "alice", accessToken }),
  };
  try {
    assert.equal(await (returnTarget as any)._handler(ctx, { code }), null);
    const issued = await (redeem as any)._handler(ctx, { code });
    assert.equal(issued.returnClaim, code);
    await assert.rejects((redeem as any)._handler(ctx, { code }), /expired/);
    const result = await (returnTarget as any)._handler(ctx, { code });
    assert.match(
      result.url,
      /^disposabl-billing-[a-f0-9]{12}-preview:\/\/billing-return$/,
    );
    assert.equal(result.expiresAt, row.returnExpiresAt);
    identity = { subject: "other" };
    assert.equal(await (returnTarget as any)._handler(ctx, { code }), null);
    identity = { subject: "browser" };
    owner = "bob";
    assert.equal(await (returnTarget as any)._handler(ctx, { code }), null);
    owner = "alice";
    row.returnChannel = "forged";
    assert.equal(await (returnTarget as any)._handler(ctx, { code }), null);
    row.returnChannel = "preview";
    row.returnExpiresAt = Date.now() - 1;
    assert.equal(await (returnTarget as any)._handler(ctx, { code }), null);
    assert.equal(
      await (returnTarget as any)._handler(ctx, { code: "../../evil" }),
      null,
    );
  } finally {
    if (previous === undefined) delete process.env.BILLING_IOS_RETURN_CHANNELS;
    else process.env.BILLING_IOS_RETURN_CHANNELS = previous;
  }
});
