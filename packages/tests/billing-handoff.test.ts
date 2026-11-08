import { test } from "node:test";
import assert from "node:assert/strict";
import { redeem, cleanup } from "../disposabl-kit/server/billing-handoff";

test("billing handoff expires and a redeemed link cannot be replayed", async () => {
  let row: any = {
    _id: "one",
    userId: "alice",
    sessionId: "session",
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
  assert.equal((await (redeem as any)._handler(ctx, { code })).userId, "alice");
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
