import { test } from "node:test";
import assert from "node:assert/strict";
import { claimIdentity as product } from "../backend/convex/telemetry";
import { claimIdentity as generic } from "../disposabl-kit/server/lib/telemetry";

function context(user: object | null, valid = true) {
  const writes: string[] = [];
  const ctx = {
    db: {
      normalizeId: () => (valid ? "owner" : null),
      get: async () => user,
      query: (table: string) => ({
        withIndex: () => ({ unique: async () => null }),
      }),
      insert: async (table: string) => {
        writes.push(table);
        return "id";
      },
      patch: async (table: string) => {
        writes.push(table);
      },
    },
    scheduler: {
      runAfter: async () => {
        writes.push("scheduler");
      },
    },
  };
  return { ctx: ctx as any, writes };
}

test("product claim denies pending, missing and invalid owners before any writes", async () => {
  for (const [user, valid] of [
    [{ deletionRequestedAt: 1 }, true],
    [null, true],
    [null, false],
  ] as const) {
    const { ctx, writes } = context(user, valid);
    await assert.rejects(
      (product as any)._handler(ctx, { newHash: "new", userId: "owner" }),
    );
    assert.deepEqual(writes, []);
  }
});

test("active owner, anonymous claim and generic starter retain issuance", async () => {
  for (const [handler, userId] of [
    [product, "owner"],
    [product, undefined],
    [generic, "owner"],
  ] as const) {
    const { ctx, writes } = context(
      userId === "owner" && handler === product ? {} : null,
    );
    assert.equal(
      await (handler as any)._handler(ctx, {
        newHash: "new",
        ...(userId ? { userId } : {}),
      }),
      false,
    );
    assert.deepEqual(writes, [
      "telemetryIssuance",
      "telemetryIdentities",
      "scheduler",
    ]);
  }
});
