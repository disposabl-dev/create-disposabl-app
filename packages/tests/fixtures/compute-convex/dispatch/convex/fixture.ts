import {
  actionGeneric as action,
  mutationGeneric as mutation,
  queryGeneric as query,
  anyApi,
} from "convex/server";
import { v } from "convex/values";
import { fund as productFund } from "./agent/actions/productCompute";
export const seed = mutation({
  args: {
    outcome: v.union(
      v.literal("confirmed"),
      v.literal("denied"),
      v.literal("unknown"),
    ),
    responseBalance: v.optional(v.number()),
  },
  handler: async (ctx, { outcome, responseBalance }) => {
    const userId = await ctx.db.insert("users", {});
    await ctx.db.insert("fixtureOwners", {
      userId,
      outcome,
      responseBalance: responseBalance ?? 90,
    });
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
    return { sessionId, userId };
  },
});
export const dispatch = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await ctx.db.insert("fixtureProviderCalls", { userId });
    const owner = await ctx.db
      .query("fixtureOwners")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!owner) throw new Error("Missing fixture owner");
    if (owner.outcome === "deferred") return { outcome: "deferred" as const };
    if (owner.outcome === "unknown") return { outcome: "unknown" as const };
    if (owner.outcome === "denied") return { outcome: "denied" as const };
    return {
      outcome: "confirmed" as const,
      responseBalance: owner.responseBalance,
    };
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
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.state !== "active" || !session.debitId)
      throw new Error("Expected a funded active session");
    const deadline = Date.now() - 1;
    await ctx.db.patch(sessionId, { paidUntil: deadline });
    await ctx.db.patch(session.debitId, { paidUntil: deadline });
  },
});
export const setOutcome = mutation({
  args: {
    userId: v.string(),
    outcome: v.union(
      v.literal("confirmed"),
      v.literal("denied"),
      v.literal("unknown"),
      v.literal("deferred"),
    ),
    responseBalance: v.optional(v.number()),
  },
  handler: async (ctx, { userId, outcome, responseBalance }) => {
    const owner = await ctx.db
      .query("fixtureOwners")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!owner) throw new Error("Missing fixture owner");
    await ctx.db.patch(owner._id, {
      outcome,
      ...(responseBalance === undefined ? {} : { responseBalance }),
    });
  },
});
export const outcome = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const owner = await ctx.db
      .query("fixtureOwners")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!owner) throw new Error("Missing fixture owner");
    return owner.outcome === "confirmed"
      ? {
          outcome: "confirmed" as const,
          responseBalance: owner.responseBalance,
        }
      : { outcome: owner.outcome };
  },
});
export const timeout = mutation({
  args: { debitId: v.id("computeDebits") },
  handler: (ctx, args) => ctx.runMutation(anyApi.agent.compute.uncertain, args),
});
export const markNotice = mutation({
  args: { debitId: v.id("computeDebits") },
  handler: async (ctx, args) => {
    await ctx.db.insert("fixtureNoticeCalls", args);
  },
});
export const noticeCount = query({
  args: { debitId: v.id("computeDebits") },
  handler: async (ctx, { debitId }) =>
    (
      await ctx.db
        .query("fixtureNoticeCalls")
        .withIndex("by_debitId", (q) => q.eq("debitId", debitId))
        .take(10)
    ).length,
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
