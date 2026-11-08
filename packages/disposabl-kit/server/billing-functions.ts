import { makeFunctionReference, type Auth } from "convex/server";
import { getSessionUserId, internalAction } from "./lib/functions";
import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
} from "../../backend/convex/_generated/server";
import { paymentsEnabled } from "../features";
import { setupBilling } from "./billing-setup";
import { nativeTopupRoutes } from "./billing-native-capability";
import {
  balanceFromCustomer,
  monthlyPlanFromCustomer,
  billingContext,
  billingRequest,
  purchaseRequest,
  mobileWebCheckoutConfigured,
  checkoutUrl,
} from "./billing";

export const setup = internalAction({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    created: v.array(v.string()),
    preserved: v.array(v.string()),
  }),
  handler: async () => setupBilling(paymentsEnabled, process.env),
});

async function context(ctx: { auth: Auth }) {
  return billingContext(paymentsEnabled, process.env, () =>
    getSessionUserId(ctx),
  );
}

const purchaseValidator = v.union(v.literal("monthly"), v.literal("topup"));
const attemptArgs = {
  userId: v.string(),
  purchase: purchaseValidator,
  requestId: v.string(),
};
const beginRef = makeFunctionReference<
  "mutation",
  { userId: string; purchase: "monthly" | "topup"; requestId: string },
  string | null | { retryAllowed: true }
>("billing:beginAttempt");
const finishRef = makeFunctionReference<
  "mutation",
  {
    userId: string;
    purchase: "monthly" | "topup";
    requestId: string;
    url: string;
  },
  null
>("billing:finishAttempt");
const pendingRef = makeFunctionReference<"query", { userId: string }, boolean>(
  "billing:hasUnknownAttempt",
);

// Persist before the provider call. A crash or lost response requires operator
// reconciliation; an automatic retry could charge the same customer twice.
export const beginAttempt = internalMutation({
  args: attemptArgs,
  returns: v.union(
    v.string(),
    v.null(),
    v.object({ retryAllowed: v.literal(true) }),
  ),
  handler: async (ctx, args) => {
    const same = await ctx.db
      .query("billingAttempts")
      .withIndex("by_userId_requestId", (q) =>
        q.eq("userId", args.userId).eq("requestId", args.requestId),
      )
      .unique();
    if (same) {
      if (same.purchase !== args.purchase)
        throw new Error("A previous checkout needs review.");
      if (same.resolvedAt !== undefined) return { retryAllowed: true as const };
      if (!same.url) throw new Error("A previous checkout needs review.");
      return same.url;
    }
    const prior = await ctx.db
      .query("billingAttempts")
      .withIndex("by_userId_purchase_resolvedAt_url", (q) => {
        const open = q
          .eq("userId", args.userId)
          .eq("purchase", args.purchase)
          .eq("resolvedAt", undefined);
        // A returned monthly link remains payable until the provider closes it.
        return args.purchase === "monthly" ? open : open.eq("url", undefined);
      })
      .first();
    if (prior) {
      if (args.purchase === "monthly" && prior.url) return prior.url;
      throw new Error("A previous checkout needs review.");
    }
    await ctx.db.insert("billingAttempts", args);
    return null;
  },
});
export const finishAttempt = internalMutation({
  args: { ...attemptArgs, url: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const prior = await ctx.db
      .query("billingAttempts")
      .withIndex("by_userId_requestId", (q) =>
        q.eq("userId", args.userId).eq("requestId", args.requestId),
      )
      .unique();
    if (
      !prior ||
      prior.purchase !== args.purchase ||
      prior.resolvedAt !== undefined ||
      prior.url
    )
      throw new Error("Invalid checkout attempt.");
    await ctx.db.patch("billingAttempts", prior._id, { url: args.url });
    return null;
  },
});
// Internal operator reconciliation retains evidence; never release a payable link.
export const resolveAttempt = internalMutation({
  args: {
    userId: v.string(),
    requestId: v.string(),
    outcome: v.union(
      v.literal("completed"),
      v.literal("expired"),
      v.literal("cancelled"),
      v.literal("not_charged"),
    ),
    evidence: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, requestId, outcome, evidence }) => {
    const row = await ctx.db
      .query("billingAttempts")
      .withIndex("by_userId_requestId", (q) =>
        q.eq("userId", userId).eq("requestId", requestId),
      )
      .unique();
    if (!row || row.resolvedAt !== undefined)
      throw new Error("Open attempt not found.");
    if (
      evidence.trim().length < 10 ||
      evidence.length > 2000 ||
      (row.url && outcome === "not_charged")
    )
      throw new Error(
        "Verify that the provider checkout is completed, cancelled or expired before releasing it.",
      );
    await ctx.db.patch("billingAttempts", row._id, {
      resolvedAt: Date.now(),
      resolution: { outcome, evidence: evidence.trim() },
    });
    return null;
  },
});
export const hasUnknownAttempt = internalQuery({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => {
    for (const purchase of ["monthly", "topup"]) {
      if (
        await ctx.db
          .query("billingAttempts")
          .withIndex("by_userId_purchase_resolvedAt_url", (q) =>
            q
              .eq("userId", userId)
              .eq("purchase", purchase)
              .eq("resolvedAt", undefined)
              .eq("url", undefined),
          )
          .first()
      )
        return true;
    }
    return false;
  },
});

export const hasPendingMonthlyAttempt = internalQuery({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId }) =>
    !!(await ctx.db
      .query("billingAttempts")
      .withIndex("by_userId_purchase_resolvedAt_url", (q) =>
        q
          .eq("userId", userId)
          .eq("purchase", "monthly")
          .eq("resolvedAt", undefined),
      )
      .first()),
});
const monthlyPendingRef = makeFunctionReference<
  "query",
  { userId: string },
  boolean
>("billing:hasPendingMonthlyAttempt");

export const snapshot = action({
  args: {},
  returns: v.object({
    balance: v.union(v.number(), v.null()),
    hasMonthlyPlan: v.union(v.boolean(), v.null()),
    nativeSubscriptionsEnabled: v.boolean(),
    nativeTopupRoutes: v.array(
      v.object({ app: v.string(), store: v.string(), product: v.string() }),
    ),
    mobileWebCheckoutEnabled: v.boolean(),
    checkoutNeedsReview: v.boolean(),
    monthlyCheckoutPending: v.boolean(),
    customerId: v.string(),
  }),
  handler: async (ctx) => {
    const { key, userId } = await context(ctx);
    try {
      const customer = await billingRequest(key, "customers.get_or_create", {
        customer_id: userId,
      });
      return {
        balance: balanceFromCustomer(customer),
        hasMonthlyPlan: monthlyPlanFromCustomer(customer),
        nativeSubscriptionsEnabled:
          process.env.REVENUECAT_SYNC_ENABLED === "true",
        nativeTopupRoutes: nativeTopupRoutes(paymentsEnabled, process.env),
        mobileWebCheckoutEnabled: mobileWebCheckoutConfigured(
          paymentsEnabled,
          process.env,
        ),
        checkoutNeedsReview: await ctx.runQuery(pendingRef, { userId }),
        monthlyCheckoutPending: await ctx.runQuery(monthlyPendingRef, {
          userId,
        }),
        customerId: userId,
      };
    } catch {
      throw new Error("Billing is temporarily unavailable.");
    }
  },
});

export const checkout = action({
  args: { purchase: purchaseValidator, requestId: v.string() },
  returns: v.object({
    url: v.union(v.string(), v.null()),
    retryAllowed: v.optional(v.literal(true)),
  }),
  handler: async (ctx, { purchase, requestId }) => {
    if (!/^[0-9a-f-]{36}$/.test(requestId))
      throw new Error("Invalid checkout request.");
    const { key, userId, returnUrl } = await context(ctx);
    if (purchase === "monthly") {
      const customer = await billingRequest(key, "customers.get_or_create", {
        customer_id: userId,
      });
      const active = monthlyPlanFromCustomer(customer);
      if (active !== false)
        throw new Error(
          active
            ? "You already have a monthly plan. Manage it where you purchased it."
            : "Could not check your current plan. Please refresh and try again.",
        );
    }
    const existing = await ctx.runMutation(beginRef, {
      userId,
      purchase,
      requestId,
    });
    if (typeof existing === "string") return { url: existing };
    if (existing?.retryAllowed)
      return { url: null, retryAllowed: true as const };
    try {
      const result = await billingRequest(
        key,
        "billing.attach",
        purchaseRequest(userId, purchase, returnUrl),
      );
      const url = checkoutUrl(result);
      if (!url) throw new Error("Checkout response is unknown.");
      await ctx.runMutation(finishRef, { userId, purchase, requestId, url });
      return { url };
    } catch {
      throw new Error(
        "Checkout status is unknown. Contact support before retrying.",
      );
    }
  },
});

export const portal = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx) => {
    const { key, userId, returnUrl } = await context(ctx);
    try {
      const result = await billingRequest(key, "billing.open_customer_portal", {
        customer_id: userId,
        return_url: returnUrl,
      });
      if (typeof result.url !== "string") throw new Error();
      return { url: result.url };
    } catch {
      throw new Error("Unable to open billing settings. Please try again.");
    }
  },
});
