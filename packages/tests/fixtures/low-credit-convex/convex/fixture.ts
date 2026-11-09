import {
  mutationGeneric as mutation,
  queryGeneric as query,
  actionGeneric as action,
  getFunctionName,
  makeFunctionReference,
} from "convex/server";
import { v } from "convex/values";
import {
  deliverNotice,
  fund,
} from "../../../../backend/convex/agent/actions/compute";
import { settle, notice } from "../../../../backend/convex/agent/compute";
import { debitCompute } from "../../../../backend/convex/agent/computeDebit";
import { observeNoticeBalance } from "../../../../backend/convex/agent/noticeBalance";
import { billingRequest } from "../../../../disposabl-kit/server/billing";
import {
  queue as actualQueue,
  queueForEligibleOwner,
} from "../../../../backend/convex/product/lowCreditEmail";

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
  args: {
    debitId: v.id("computeDebits"),
    failed: v.optional(v.boolean()),
    disabled: v.optional(v.boolean()),
    observation: v.optional(
      v.object({
        userId: v.id("users"),
        paidUntil: v.number(),
        balance: v.number(),
        observedAt: v.number(),
      }),
    ),
  },
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

// Shorten a confirmed synthetic window to exercise its scheduled expiry promptly.
export const shortenWindow = mutation({
  args: { debitId: v.id("computeDebits"), paidUntil: v.number() },
  handler: async (ctx, { debitId, paidUntil }) => {
    const debit = await ctx.db.get(debitId);
    if (!debit || debit.state !== "confirmed" || paidUntil >= debit.paidUntil)
      throw new Error("Expected a confirmed window and earlier deadline");
    const session = await ctx.db.get(debit.sessionId);
    if (!session || session.state !== "active" || session.debitId !== debitId)
      throw new Error("Expected the current active session");
    await ctx.db.patch(debitId, { paidUntil });
    await ctx.db.patch(session._id, { paidUntil });
  },
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

export const recordRead = mutation({
  args: {
    debitId: v.id("computeDebits"),
    method: v.string(),
    nonConsuming: v.boolean(),
  },
  handler: (ctx, args) => ctx.db.insert("fixtureReads", args),
});
export const reads = query({
  args: { debitId: v.id("computeDebits") },
  handler: (ctx, args) =>
    ctx.db
      .query("fixtureReads")
      .withIndex("by_debit", (q) => q.eq("debitId", args.debitId))
      .take(20),
});
export const releaseRead = mutation({
  args: { debitId: v.id("computeDebits") },
  handler: (ctx, args) =>
    ctx.db.insert("fixtureReads", {
      ...args,
      method: "release",
      nonConsuming: false,
    }),
});
export const readReleased = query({
  args: { debitId: v.id("computeDebits") },
  handler: async (ctx, args) =>
    (
      await ctx.db
        .query("fixtureReads")
        .withIndex("by_debit", (q) => q.eq("debitId", args.debitId))
        .take(20)
    ).some((entry) => entry.method === "release"),
});
export const deliverInitialReadFailure = action({
  args: { debitId: v.id("computeDebits"), attempt: v.number() },
  handler: (ctx, args) => {
    const wrapped = {
      ...ctx,
      runQuery: (ref: any, queryArgs: any) => {
        if (getFunctionName(ref) === "agent/compute:getDebit")
          throw new Error("injected initial read failure");
        return ctx.runQuery(ref, queryArgs);
      },
    };
    return deliverNotice(wrapped as any, args.debitId as any, args.attempt, {
      enabled: true,
      environment: "production",
      observe: async () => {
        throw new Error("unexpected observation");
      },
    });
  },
});
export const deliverInert = action({
  args: {
    debitId: v.id("computeDebits"),
    attempt: v.number(),
    balance: v.number(),
    mode: v.union(
      v.literal("ok"),
      v.literal("http-error"),
      v.literal("malformed"),
      v.literal("expire"),
      v.literal("hold"),
    ),
  },
  handler: (ctx, args) =>
    deliverNotice(ctx as any, args.debitId as any, args.attempt, {
      // Only this explicit fixture invocation bypasses the action gate; the
      // deployment remains E2E-disabled and its queue is an inert marker.
      enabled: true,
      environment: "production",
      observe: (userId) =>
        observeNoticeBalance(userId, "fixture", (key, method, body) =>
          billingRequest(key, method, body, async (_url, init) => {
            const request = JSON.parse(String(init?.body));
            await ctx.runMutation(
              makeFunctionReference("fixture:recordRead") as any,
              {
                debitId: args.debitId,
                method,
                nonConsuming: request.send_event === false,
              },
            );
            if (args.mode === "hold") {
              let released = false;
              for (let i = 0; i < 100 && !released; i++) {
                released = await ctx.runQuery(
                  makeFunctionReference("fixture:readReleased") as any,
                  { debitId: args.debitId },
                );
                if (!released)
                  await new Promise((resolve) => setTimeout(resolve, 30));
              }
              if (!released)
                throw new Error("fixture observation barrier timed out");
            }
            if (args.mode === "expire")
              await ctx.runMutation(
                makeFunctionReference("fixture:expire") as any,
                { debitId: args.debitId },
              );
            if (args.mode === "http-error")
              return new Response("unavailable", { status: 503 });
            return new Response(
              JSON.stringify(
                args.mode === "malformed"
                  ? {}
                  : {
                      customer_id: userId,
                      required_balance: 10,
                      allowed: args.balance >= 10,
                      balance: {
                        feature_id: "credits",
                        unlimited: false,
                        overage_allowed: false,
                        remaining: args.balance,
                      },
                    },
              ),
              { status: 200 },
            );
          }),
        ),
    }),
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
