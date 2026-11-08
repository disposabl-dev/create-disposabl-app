import {
  actionGeneric as action,
  mutationGeneric as mutation,
  queryGeneric as query,
  anyApi,
} from "convex/server";
import { v } from "convex/values";
import { fund as productFund } from "./agent/actions/productCompute";
export const seed = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const sessionId = await ctx.db.insert("computeSessions", {
      userId,
      state: "starting",
      paidUntil: 0,
    });
    await ctx.db.insert("apps", {
      appId: userId,
      name: "fixture",
      platforms: ["web"],
      userId,
      agent: {
        threadId: userId,
        computeSessionId: sessionId,
        status: "processing",
        pending: [],
        updatedAt: Date.now(),
      },
    });
    return sessionId;
  },
});
export const dispatch = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await ctx.db.insert("fixtureProviderCalls", { userId });
    return userId.endsWith("unknown")
      ? { outcome: "unknown" as const }
      : { outcome: "confirmed" as const, responseBalance: 90 };
  },
});
export const fund = action({
  args: { sessionId: v.id("computeSessions") },
  handler: async (ctx, { sessionId }) => {
    await productFund(ctx as any, sessionId, undefined, async (userId) =>
      ctx.runMutation(anyApi.fixture.dispatch, { userId }),
    );
    return null;
  },
});
export const renew = action({
  args: {
    sessionId: v.id("computeSessions"),
    expectedDebit: v.id("computeDebits"),
  },
  handler: (ctx, args) =>
    ctx.runAction(anyApi.agent.actions.compute.renew, args),
});
export const expire = mutation({
  args: { sessionId: v.id("computeSessions") },
  handler: (ctx, { sessionId }) =>
    ctx.db.patch(sessionId, { paidUntil: Date.now() - 1 }),
});
// Test-only eligible branch: production active windows stop at expiry.
export const prepareEligibleRenewal = mutation({
  args: { sessionId: v.id("computeSessions") },
  handler: (ctx, { sessionId }) =>
    ctx.db.patch(sessionId, { state: "starting" }),
});
export const inspect = query({
  args: { sessionId: v.id("computeSessions"), userId: v.string() },
  handler: async (ctx, { sessionId, userId }) => ({
    session: await ctx.db.get(sessionId),
    debits: await ctx.db
      .query("computeDebits")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .take(10),
    calls: (
      await ctx.db
        .query("fixtureProviderCalls")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(10)
    ).length,
  }),
});
