import { test } from "node:test";
import assert from "node:assert/strict";
import { requireCredits } from "../backend/convex/agent/credits";
import { guardedEnqueue } from "../backend/convex/agent/internal";
import { createPlatforms } from "../disposabl-kit/server/lib/platform-spec";
import * as agent from "../backend/convex/agent/internal";

const customer =
  (remaining: unknown) =>
  async (_key: string, _method: string, body: object) => {
    assert.deepEqual(body, { customer_id: "owner" });
    return { balances: { credits: { remaining } } };
  };

test("credits gate checks the actual owner balance and fails closed", async () => {
  await requireCredits("owner", false, undefined, async () => {
    throw new Error("unexpected request");
  });
  await requireCredits("owner", true, "test-key", customer(10));
  await assert.rejects(
    requireCredits("owner", true, "test-key", customer(9)),
    (error: any) =>
      error.data?.code === "credits_required" &&
      error.data.balance === 9 &&
      error.data.minimum === 10,
  );
  for (const request of [
    customer(null),
    async () => {
      throw new Error("network");
    },
  ]) {
    await assert.rejects(
      requireCredits("owner", true, "test-key", request),
      (error: any) => error.data?.code === "credits_unavailable",
    );
  }
  await assert.rejects(
    requireCredits("owner", true, "", customer(100)),
    (error: any) => error.data?.code === "credits_unavailable",
  );
});

test("ownership and credits precede enqueue, with no public unchecked endpoint", async () => {
  const calls: string[] = [];
  const ctx = {
    runQuery: async (_ref: unknown, args: any) => {
      calls.push(`owner:${args.userId}`);
    },
    runMutation: async (_ref: unknown, args: any) => {
      calls.push(`enqueue:${args.userId}`);
      return { appId: args.appId, threadId: "thread", status: "processing" };
    },
  };
  const args = { userId: "owner", appId: "app", prompt: "work" };
  await assert.rejects(
    guardedEnqueue(ctx as any, args, async (user) => {
      calls.push(`balance:${user}`);
      throw new Error("denied");
    }),
    /denied/,
  );
  assert.deepEqual(calls, ["owner:owner", "balance:owner"]);
  calls.length = 0;
  await guardedEnqueue(ctx as any, args, async (user) => {
    calls.push(`balance:${user}`);
  });
  assert.deepEqual(calls, ["owner:owner", "balance:owner", "enqueue:owner"]);
  calls.length = 0;
  await assert.rejects(
    guardedEnqueue(
      {
        ...ctx,
        runQuery: async () => {
          throw new Error("not owner");
        },
      } as any,
      { ...args, userId: "other" },
      async () => {
        calls.push("balance");
      },
    ),
    /not owner/,
  );
  assert.deepEqual(calls, []);
  const platform = createPlatforms({ "agent/internal": agent });
  assert.ok(
    platform.spec.some(
      (entry: any) =>
        entry.name === "agent/internal:sendMessage" && entry.type === "action",
    ),
  );
  assert.ok(
    !platform.spec.some(
      (entry: any) => entry.name === "agent/internal:enqueueMessage",
    ),
  );
});
