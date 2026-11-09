import { test } from "node:test";
import assert from "node:assert/strict";
import { getFunctionName } from "convex/server";
import { requireCredits } from "../backend/convex/agent/credits";
import { guardedEnqueue } from "../backend/convex/agent/internal";
import { createPlatforms } from "../disposabl-kit/server/lib/platform-spec";
import * as agent from "../backend/convex/agent/internal";
import * as agentNative from "../backend/convex/agent/index";
import * as appsNative from "../backend/convex/apps/index";
import * as appsInternal from "../backend/convex/apps/internal";
import { debitCompute } from "../backend/convex/agent/computeDebit";

test("compute debit validates the atomic check response and never retries ambiguity", async () => {
  let calls = 0;
  const good = {
    allowed: true,
    customer_id: "owner",
    required_balance: 10,
    balance: {
      feature_id: "credits",
      unlimited: false,
      overage_allowed: false,
      remaining: 0,
    },
  };
  const request =
    (response: Record<string, unknown>) =>
    async (_key: string, method: string, body: object) => {
      calls++;
      assert.equal(method, "balances.check");
      assert.deepEqual(body, {
        customer_id: "owner",
        feature_id: "credits",
        required_balance: 10,
        send_event: true,
      });
      return response;
    };
  assert.deepEqual(await debitCompute("owner", false, "key", request(good)), {
    outcome: "disabled",
  });
  assert.equal(calls, 0);
  assert.deepEqual(await debitCompute("owner", true, "key", request(good)), {
    outcome: "confirmed",
    responseBalance: 0,
  });
  assert.deepEqual(
    await debitCompute(
      "owner",
      true,
      "key",
      request({ ...good, allowed: false }),
    ),
    { outcome: "denied" },
  );
  for (const response of [
    { ...good, customer_id: "other" },
    { ...good, required_balance: 1 },
    { ...good, balance: { ...good.balance, unlimited: true } },
    { ...good, balance: { ...good.balance, overage_allowed: true } },
    { ...good, balance: { ...good.balance, remaining: null } },
    { ...good, balance: null },
  ])
    assert.deepEqual(
      await debitCompute("owner", true, "key", request(response)),
      { outcome: "unknown" },
    );
  const before = calls;
  assert.deepEqual(
    await debitCompute("owner", true, "key", async () => {
      calls++;
      throw new Error("timeout");
    }),
    { outcome: "unknown" },
  );
  assert.equal(calls, before + 1);
});

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
      error.data.minimum === 10 &&
      error.data.paymentUrl === "https://www.disposabl.dev/pricing",
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
    runQuery: async (ref: any, args: any) => {
      if (getFunctionName(ref) === "users/internal:deletionPending")
        return false;
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

test("agent guard and checked configuration contracts are retained", () => {
  assert.equal("sendMessage" in agentNative, false);
  assert.equal((agentNative.sendMessageChecked as any).isAction, true);
  assert.equal("requestConfiguration" in appsNative, false);
  assert.equal((appsNative.requestConfigurationChecked as any).isAction, true);
  assert.equal("requestConfigurationLegacy" in appsInternal, false);
  const platform = createPlatforms({ "apps/internal": appsInternal });
  assert.ok(
    platform.spec.some(
      (entry) =>
        entry.name === "apps/internal:requestConfiguration" &&
        entry.type === "action",
    ),
  );
  assert.ok(
    !platform.spec.some(
      (entry) => entry.name === "apps/internal:requestConfigurationLegacy",
    ),
  );
});

test("debit response is preserved through the real HTTP parser without a second request", async () => {
  const { billingRequest } = await import("../disposabl-kit/server/billing");
  let calls = 0;
  const result = await debitCompute(
    "owner",
    true,
    "fixture",
    (key, method, body) =>
      billingRequest(key, method, body, async (url, options) => {
        calls++;
        assert.equal(url, "https://api.useautumn.com/v1/balances.check");
        assert.equal(JSON.parse(String(options?.body)).send_event, true);
        return new Response(
          JSON.stringify({
            customer_id: "owner",
            required_balance: 10,
            allowed: true,
            balance: {
              feature_id: "credits",
              unlimited: false,
              overage_allowed: false,
              remaining: 7,
            },
          }),
          { status: 200 },
        );
      }),
  );
  assert.deepEqual(result, { outcome: "confirmed", responseBalance: 7 });
  assert.equal(calls, 1);
});

test("pending deletion prevents balance lookup before admission", async () => {
  let charged = false;
  await assert.rejects(
    guardedEnqueue(
      { runQuery: async () => true } as any,
      { userId: "owner", prompt: "work" },
      async () => {
        charged = true;
      },
    ),
    /Account deletion has been requested/,
  );
  assert.equal(charged, false);
});

test("paid worker tick fences provider dispatch in an isolated subprocess", async () => {
  const { spawnSync } = await import("node:child_process");
  const { join } = await import("node:path");
  const result = spawnSync(
    process.execPath,
    [
      "test",
      join(
        import.meta.dirname,
        "fixtures/agent-inert-convex/paid-tick.test.mjs",
      ),
    ],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        E2E_TELEMETRY_DISABLED: "1",
        DO_NOT_TRACK: "1",
        NODE_ENV: "test",
      },
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /6 pass/);
});
