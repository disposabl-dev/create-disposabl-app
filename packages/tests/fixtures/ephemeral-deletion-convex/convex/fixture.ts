import {
  mutationGeneric as mutation,
  queryGeneric as query,
  anyApi,
} from "convex/server";
import { v } from "convex/values";

export const create = mutation({
  args: { pending: v.boolean() },
  handler: async (ctx, { pending }) => {
    const requestedAt = 123456;
    const userId = await ctx.db.insert(
      "users",
      pending ? { deletionRequestedAt: requestedAt } : {},
    );
    return { userId, requestedAt };
  },
});
export const seed = mutation({
  args: { userId: v.id("users"), count: v.number() },
  handler: async (ctx, { userId, count }) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("billingHandoffs", {
        hash: `${userId}-${i}`,
        userId,
        sessionId: "synthetic",
        expiresAt: 100,
      });
      await ctx.db.insert("telemetryIdentities", {
        hash: `${userId}-${i}`,
        userId,
        expiresAt: 100,
      });
    }
    return null;
  },
});
export const seedRetained = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await ctx.db.insert("telemetryIdentities", {
      hash: "anonymous",
      expiresAt: 100,
    });
    await ctx.db.insert("telemetryIssuance", {
      key: "global",
      tokens: 3,
      updatedAt: 1,
    });
    await ctx.db.insert("billingAttempts", {
      userId,
      purchase: "monthly",
      requestId: "synthetic",
    });
    const sessionId = await ctx.db.insert("computeSessions", {
      userId,
      state: "stopped",
      paidUntil: 1,
    });
    await ctx.db.insert("computeDebits", {
      sessionId,
      state: "confirmed",
      paidUntil: 1,
    });
    await ctx.db.insert("revenueCatDeliveries", {
      deliveryId: "synthetic",
      project: "fixture",
      app: "fixture",
      environment: "SANDBOX",
      store: "fixture",
      product: "fixture",
      customer: userId,
      transaction: "fixture",
      type: "purchase",
      balanceId: "fixture",
      conflict: false,
    });
    await ctx.db.insert("deletionReceipts", {
      ownerId: userId,
      reference: "synthetic",
      requestedAt: 123456,
    });
    return null;
  },
});
export const batch = mutation({
  args: {
    userId: v.id("users"),
    expectedRequestedAt: v.number(),
    rollback: v.optional(v.boolean()),
  },
  handler: async (ctx, { rollback, ...args }) => {
    const result = await ctx.runMutation(
      anyApi.users.ephemeralDeletion.runBatch,
      args,
    );
    if (rollback) throw new Error("synthetic rollback");
    return result;
  },
});
export const inspect = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => ({
    userExists: !!(await ctx.db.get(userId)),
    debits: (await ctx.db.query("computeDebits").take(2)).length,
    deliveries: (await ctx.db.query("revenueCatDeliveries").take(2)).length,
    progress: (await ctx.db.get(userId))?.ephemeralDeletion ?? null,
    handoffs: (
      await ctx.db
        .query("billingHandoffs")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(300)
    ).length,
    identities: (
      await ctx.db
        .query("telemetryIdentities")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(300)
    ).length,
    anonymous: (
      await ctx.db
        .query("telemetryIdentities")
        .withIndex("by_hash", (q) => q.eq("hash", "anonymous"))
        .take(2)
    ).length,
    global: (
      await ctx.db
        .query("telemetryIssuance")
        .withIndex("by_key", (q) => q.eq("key", "global"))
        .take(2)
    ).length,
    attempts: (
      await ctx.db
        .query("billingAttempts")
        .withIndex("by_userId_requestId", (q) => q.eq("userId", userId))
        .take(2)
    ).length,
    receipts: (
      await ctx.db
        .query("deletionReceipts")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId))
        .take(2)
    ).length,
  }),
});

export const reRequest = mutation({
  args: { userId: v.id("users"), requestedAt: v.number() },
  handler: async (ctx, { userId, requestedAt }) => {
    await ctx.db.patch(userId, { deletionRequestedAt: requestedAt });
    return null;
  },
});

// The user ID stands in for the production HTTP action's verified session.
export const claim = mutation({
  args: {
    hash: v.optional(v.string()),
    newHash: v.string(),
    userId: v.optional(v.string()),
  },
  handler: (ctx, args) => ctx.runMutation(anyApi.telemetry.claimIdentity, args),
});
export const identity = query({
  args: { hash: v.string() },
  handler: (ctx, { hash }) =>
    ctx.db
      .query("telemetryIdentities")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique(),
});
export const bucket = query({
  args: {},
  handler: (ctx) =>
    ctx.db
      .query("telemetryIssuance")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique(),
});
