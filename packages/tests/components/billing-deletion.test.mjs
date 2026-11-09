import { test, expect } from "bun:test";
import config from "../../../disposabl.json";
import { getFunctionName } from "convex/server";
config.features.push("payments");
process.env.AUTUMN_SECRET_KEY = "fixture-only";
process.env.BILLING_RETURN_URL = "https://example.test/pricing";
process.env.MOBILE_WEB_CHECKOUT_ENABLED = "true";
process.env.REVENUECAT_SYNC_ENABLED = "true";
const product = await import("../../backend/convex/billing");
const handoff = await import("../../backend/convex/billingHandoff");
const generic = await import("../../disposabl-kit/server/billing-functions");
const genericHandoff =
  await import("../../disposabl-kit/server/billing-handoff");
let pending = false,
  calls = [],
  finished = 0;
const ctx = {
  auth: { getUserIdentity: async () => ({ subject: "session" }) },
  runQuery: async (ref, args) => {
    if (args.sessionId) return { userId: "owner" };
    if (getFunctionName(ref) === "users/internal:deletionPending")
      return pending;
    return false;
  },
  runMutation: async (ref) => {
    if (getFunctionName(ref) === "billing:finishAttempt") {
      finished++;
      return null;
    }
    return null;
  },
};
const requestId = "12345678-1234-4123-8123-123456789abc";
globalThis.fetch = async (_url, init) => {
  calls.push(JSON.parse(init.body));
  return Response.json({
    subscriptions: [],
    balances: { credits: { remaining: 20 } },
    payment_url: "https://checkout.example/test",
  });
};
test("pending and missing owners cannot start checkout or customer-creating snapshot", async () => {
  for (const reason of ["pending", "missing"]) {
    pending = true;
    calls = [];
    await expect(
      product.checkout._handler(ctx, { purchase: "monthly", requestId }),
    ).rejects.toThrow("Account deletion");
    await expect(product.snapshot._handler(ctx, {})).rejects.toThrow(
      "Account deletion",
    );
    expect(calls).toHaveLength(0);
  }
  pending = false;
  calls = [];
  await product.checkout._handler(ctx, { purchase: "monthly", requestId });
  expect(calls).toHaveLength(2);
});
test("generic starter checkout has no deletion policy", async () => {
  pending = true;
  calls = [];
  await generic.checkout._handler(ctx, { purchase: "topup", requestId });
  expect(calls).toHaveLength(1);
});
test("begin transaction denies pending before writes", async () => {
  pending = true;
  let touched = false;
  await expect(
    product.beginAttempt._handler(
      {
        ...ctx,
        db: {
          query() {
            touched = true;
            throw new Error("unexpected");
          },
        },
      },
      { userId: "owner", purchase: "topup", requestId },
    ),
  ).rejects.toThrow("Account deletion");
  expect(touched).toBe(false);
});
test("handoff create and preexisting redeem are fenced; generic redeem remains available", async () => {
  pending = true;
  let exchanges = 0,
    writes = 0;
  const row = {
    _id: "row",
    userId: "owner",
    sessionId: "session",
    purchase: "topup",
    expiresAt: Date.now() + 120000,
  };
  const local = {
    ...ctx,
    db: {
      query: () => ({ withIndex: () => ({ unique: async () => row }) }),
      insert: async () => {
        writes++;
      },
      delete: async () => {
        writes++;
      },
    },
    runMutation: async () => {
      exchanges++;
      return { userId: "owner" };
    },
    scheduler: {
      runAfter: async () => {
        writes++;
      },
    },
  };
  await expect(
    handoff.create._handler(local, { purchase: "topup" }),
  ).rejects.toThrow("Account deletion");
  await expect(
    handoff.redeem._handler(local, { code: "Q".repeat(43) }),
  ).rejects.toThrow("Account deletion");
  expect(
    await handoff.inspect._handler(local, { code: "Q".repeat(43) }),
  ).toBeNull();
  expect(exchanges).toBe(0);
  expect(writes).toBe(0);
  await genericHandoff.redeem._handler(local, { code: "Q".repeat(43) });
  expect(exchanges).toBe(1);
});
test("late provider result is recorded while delivery is denied", async () => {
  pending = false;
  calls = [];
  finished = 0;
  globalThis.fetch = async () => {
    pending = true;
    return Response.json({ payment_url: "https://checkout.example/test" });
  };
  await expect(
    product.checkout._handler(ctx, { purchase: "topup", requestId }),
  ).rejects.toThrow("Checkout status is unknown");
  expect(finished).toBe(1);
});

test("eligibility fails closed for invalid, missing, and pending owners", async () => {
  const { deletionPending } =
    await import("../../backend/convex/users/deletion");
  for (const [id, user, expected] of [
    [null, null, true],
    ["missing", null, true],
    ["pending", { deletionRequestedAt: 1 }, true],
    ["active", {}, false],
  ]) {
    const db = { normalizeId: () => id, get: async () => user };
    expect(await deletionPending({ db }, "owner")).toBe(expected);
  }
});

test("pending owner can still open the existing billing portal", async () => {
  pending = true;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return Response.json({ url: "https://portal.example/test" });
  };
  expect(await product.portal._handler(ctx, {})).toEqual({
    url: "https://portal.example/test",
  });
  expect(requests).toBe(1);
});
