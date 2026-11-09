// Public entrypoints exist only in this disposable local test deployment.
import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";
import {
  receive,
  claim,
  complete,
  confirmUnknown,
  confirmFullRefund,
  receiveTransfer,
  recordTransferReview,
  redispatchQueued,
} from "../../../../disposabl-kit/server/revenuecat-functions";
import { purchaseEventFields } from "../../../../disposabl-kit/server/revenuecat-validator";
import {
  revenueCatConfigs,
  resolveRevenueCatRoute,
  selectRevenueCatRoute,
} from "../../../../disposabl-kit/server/revenuecat-contract";

export const user = mutation({
  args: { label: v.string() },
  returns: v.id("users"),
  handler: (ctx, a) => ctx.db.insert("users", a),
});
export const deliver = mutation({
  args: { event: v.object(purchaseEventFields), balanceId: v.string() },
  returns: v.string(),
  handler: (ctx, a) => (receive as any)._handler(ctx, a),
});
const scope = {
  balanceId: v.string(),
  project: v.string(),
  app: v.string(),
  environment: v.string(),
  store: v.string(),
  product: v.string(),
};
export const take = mutation({
  args: scope,
  returns: v.union(
    v.null(),
    v.object({
      customer: v.string(),
      kind: v.union(v.literal("grant"), v.literal("refund")),
    }),
  ),
  handler: (ctx, a) => (claim as any)._handler(ctx, a),
});
export const finish = mutation({
  args: {
    balanceId: v.string(),
    kind: v.union(v.literal("grant"), v.literal("refund")),
  },
  returns: v.null(),
  handler: (ctx, a) => (complete as any)._handler(ctx, a),
});
export const reconcile = mutation({
  args: {
    balanceId: v.string(),
    kind: v.union(v.literal("grant"), v.literal("refund")),
    evidence: v.string(),
  },
  returns: v.boolean(),
  handler: (ctx, a) => (confirmUnknown as any)._handler(ctx, a),
});
export const approveRefund = mutation({
  args: { balanceId: v.string(), evidence: v.string() },
  returns: v.boolean(),
  handler: (ctx, a) => (confirmFullRefund as any)._handler(ctx, a),
});
const transferScope = {
  project: v.string(),
  app: v.string(),
  environment: v.string(),
  deliveryId: v.string(),
  from: v.array(v.string()),
  to: v.array(v.string()),
};
export const transfer = mutation({
  args: transferScope,
  returns: v.null(),
  handler: (ctx, a) => (receiveTransfer as any)._handler(ctx, a),
});
export const reviewTransfer = mutation({
  args: { ...transferScope, evidence: v.string() },
  returns: v.boolean(),
  handler: (ctx, a) => (recordTransferReview as any)._handler(ctx, a),
});
export const retryQueued = mutation({
  args: { ...scope, customer: v.string() },
  returns: v.boolean(),
  handler: (ctx, a) => (redispatchQueued as any)._handler(ctx, a),
});
export const transferState = query({
  args: {
    project: v.string(),
    app: v.string(),
    environment: v.string(),
    deliveryId: v.string(),
    customer: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, a) => ({
    transfer: await ctx.db
      .query("revenueCatTransfers")
      .withIndex("by_delivery", (q) =>
        q
          .eq("project", a.project)
          .eq("app", a.app)
          .eq("environment", a.environment)
          .eq("deliveryId", a.deliveryId),
      )
      .unique(),
    holds: await ctx.db
      .query("revenueCatTransferHolds")
      .withIndex("by_customer_active", (q) =>
        q
          .eq("project", a.project)
          .eq("environment", a.environment)
          .eq("customer", a.customer)
          .eq("active", true),
      )
      .take(10),
  }),
});
export const state = query({
  args: { balanceId: v.string() },
  returns: v.any(),
  handler: async (ctx, { balanceId }) => ({
    purchase: await ctx.db
      .query("revenueCatPurchases")
      .withIndex("by_balanceId", (q) => q.eq("balanceId", balanceId))
      .unique(),
    deliveries: await ctx.db
      .query("revenueCatDeliveries")
      .withIndex("by_balanceId", (q) => q.eq("balanceId", balanceId))
      .take(100),
  }),
});
export const route = query({
  args: { routes: v.string(), event: v.any(), identity: v.any() },
  returns: v.any(),
  handler: (_ctx, a) => {
    const configs = revenueCatConfigs(true, {
      REVENUECAT_CONSUMABLE_OWNER: "custom",
      REVENUECAT_WEBHOOK_AUTH: "fixture",
      REVENUECAT_PROJECT_ID: "project",
      REVENUECAT_ENVIRONMENT: "SANDBOX",
      REVENUECAT_ROUTES: a.routes,
      AUTUMN_SECRET_KEY: "am_sk_test_fixture",
    });
    return configs
      ? {
          selected: selectRevenueCatRoute(a.event, configs)?.app ?? null,
          resolved: resolveRevenueCatRoute(a.identity, configs)?.app ?? null,
        }
      : null;
  },
});
