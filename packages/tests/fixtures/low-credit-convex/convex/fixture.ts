import {
  mutationGeneric as mutation,
  queryGeneric as query,
  actionGeneric as action,
  makeFunctionReference,
} from "convex/server";
import { v } from "convex/values";
import {
  deliverNotice,
  fund,
} from "../../../../backend/convex/agent/actions/compute";
import { settle, notice } from "../../../../backend/convex/agent/compute";
import { debitCompute } from "../../../../backend/convex/agent/computeDebit";
import { billingRequest } from "../../../../disposabl-kit/server/billing";
import {
  queue as actualQueue,
  queueForEligibleOwner,
} from "../../../../backend/convex/product/lowCreditEmail";

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
    responseBalance: v.optional(v.number()),
    outcome: v.union(
      v.literal("confirmed"),
      v.literal("denied"),
      v.literal("unknown"),
    ),
  },
  handler: (ctx, args) => (settle as any)._handler(ctx, args),
});
export const notify = mutation({
  args: { debitId: v.id("computeDebits"), failed: v.optional(v.boolean()) },
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
  handler: (ctx) =>
    ctx.db.system.query("_scheduled_functions").order("desc").take(100),
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

export const deliver = action({
  args: { debitId: v.id("computeDebits"), attempt: v.number() },
  handler: (ctx, args) =>
    deliverNotice(ctx as any, args.debitId as any, args.attempt),
});

export const seedUnclaimed = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await ctx.db.insert("users", {
      profile: { email: "verified@example.invalid" },
    });
    const sessionId = await ctx.db.insert("computeSessions", {
      userId,
      state: "starting",
      paidUntil: 0,
    });
    await ctx.db.insert("apps", {
      appId: sessionId,
      name: "fixture",
      platforms: ["web"],
      userId,
      agent: {
        threadId: sessionId,
        computeSessionId: sessionId,
        status: "processing",
        pending: [],
        updatedAt: Date.now(),
      },
    });
    return { userId, sessionId };
  },
});
export const session = query({
  args: { sessionId: v.id("computeSessions") },
  handler: (ctx, args) => ctx.db.get(args.sessionId),
});
export const fundFixture = action({
  args: { sessionId: v.id("computeSessions"), responseBalance: v.number() },
  handler: (ctx, args) =>
    fund(ctx as any, args.sessionId as any, undefined, async (userId) =>
      debitCompute(userId, true, "fixture", (key, method, body) =>
        billingRequest(
          key,
          method,
          body,
          async () =>
            new Response(
              JSON.stringify({
                customer_id: userId,
                required_balance: 10,
                allowed: true,
                balance: {
                  feature_id: "credits",
                  unlimited: false,
                  overage_allowed: false,
                  remaining: args.responseBalance,
                },
              }),
              { status: 200 },
            ),
        ),
      ),
    ),
});

// Synthetic marker only: the real email gate remains enabled in the deployment.
export const enqueueInert = mutation({
  args: { userId: v.id("users"), key: v.string() },
  handler: (ctx, { userId, key }) =>
    queueForEligibleOwner(ctx as any, userId, async () => {
      await ctx.db.insert("fixtureEmails", {
        key,
        to: "inert",
        text: "no email",
      });
      return "queued" as const;
    }),
});
export const requestDeletion = mutation({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) =>
    ctx.db.patch(userId, { deletionRequestedAt: Date.now() }),
});
export const removeSyntheticUser = mutation({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) => ctx.db.delete(userId),
});
