import {
  mutationGeneric as mutation,
  queryGeneric as query,
  makeFunctionReference,
} from "convex/server";
import { v } from "convex/values";
import { settle, notice } from "../../../../backend/convex/agent/compute";
import { queue as actualQueue } from "../../../../backend/convex/product/lowCreditEmail";

export const config = mutation({
  args: {
    enabled: v.boolean(),
    environment: v.string(),
    e2e: v.string(),
    fail: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("fixtureConfig").first();
    if (existing) await ctx.db.patch(existing._id, args);
    else await ctx.db.insert("fixtureConfig", args);
  },
});
export const seed = mutation({
  args: { paidUntil: v.number(), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert(
      "users",
      args.email ? { profile: { email: args.email } } : {},
    );
    const sessionId = await ctx.db.insert("computeSessions", {
      userId,
      state: "starting",
      paidUntil: 0,
    });
    const debitId = await ctx.db.insert("computeDebits", {
      sessionId,
      state: "dispatching",
      paidUntil: args.paidUntil,
    });
    await ctx.db.patch(sessionId, { debitId });
    return { userId, sessionId, debitId };
  },
});
export const settleDebit = mutation({
  args: {
    debitId: v.id("computeDebits"),
    outcome: v.union(
      v.literal("confirmed"),
      v.literal("denied"),
      v.literal("unknown"),
    ),
  },
  handler: (ctx, args) => (settle as any)._handler(ctx, args),
});
export const notify = mutation({
  args: { debitId: v.id("computeDebits"), balance: v.number() },
  handler: (ctx, args) => (notice as any)._handler(ctx, args),
});
export const debit = query({
  args: { debitId: v.id("computeDebits") },
  handler: (ctx, args) => ctx.db.get(args.debitId),
});
export const emails = query({
  args: {},
  handler: (ctx) => ctx.db.query("fixtureEmails").take(100),
});
export const queueDirect = mutation({
  args: {
    userId: v.id("users"),
    windowId: v.string(),
    paidUntil: v.number(),
    balance: v.number(),
  },
  handler: async (ctx, args) =>
    ctx.runMutation(
      makeFunctionReference("product/lowCreditEmail:queue") as any,
      args,
    ),
});

export const scheduled = query({
  args: {},
  handler: (ctx) => ctx.db.system.query("_scheduled_functions").take(100),
});

export const expire = mutation({
  args: { debitId: v.id("computeDebits") },
  handler: (ctx, args) =>
    ctx.db.patch(args.debitId, { paidUntil: Date.now() - 1 }),
});

export const actualProductQueue = mutation({
  args: {
    userId: v.id("users"),
    windowId: v.string(),
    paidUntil: v.number(),
    balance: v.number(),
  },
  handler: (ctx, args) => (actualQueue as any)._handler(ctx, args),
});
