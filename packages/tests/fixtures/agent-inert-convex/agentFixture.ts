// Mounted only on a disposable local backend by the fixture runner.
import {
  anyApi,
  internalActionGeneric,
  internalMutationGeneric,
} from "convex/server";
import { v } from "convex/values";

export const noop = internalActionGeneric({
  args: {},
  returns: v.null(),
  handler: async () => null,
});
export const seedLease = internalMutationGeneric({
  args: { appId: v.string(), userId: v.string(), token: v.string() },
  returns: v.null(),
  handler: async (ctx, { appId, userId, token }) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q: any) => q.eq("appId", appId))
      .unique();
    if (!app || app.userId !== userId || !app.agent || app.agent.lease)
      throw new Error("Fixture app unavailable");
    const watchdog = await ctx.scheduler.runAfter(
      60 * 60_000,
      anyApi.agentFixture.noop,
      {},
    );
    await ctx.db.patch(app._id, {
      agent: {
        ...app.agent,
        lease: { token, watchdog, expiresAt: Date.now() + 60 * 60_000 },
      },
    });
    return null;
  },
});

import { getFunctionName } from "convex/server";
import {
  enqueueMessageHandler,
  abortMessage,
} from "../../../../backend/convex/agent/internal";

// Fixture-only adapter: only the product worker tick may be substituted.
function inertDispatch(ctx: any) {
  return {
    ...ctx,
    scheduler: {
      ...ctx.scheduler,
      runAfter: async (_delay: number, ref: any) => {
        if (getFunctionName(ref) !== "agent/actions/run:tick")
          throw new Error("Unexpected scheduled function in agent fixture");
        return ctx.scheduler.runAfter(0, anyApi.agentFixture.noop, {});
      },
    },
  };
}
export const enqueue = internalMutationGeneric({
  args: {
    userId: v.string(),
    appId: v.string(),
    prompt: v.string(),
    fileIds: v.array(v.id("files")),
  },
  returns: v.any(),
  handler: (ctx, args) =>
    enqueueMessageHandler(inertDispatch(ctx), args, () => true),
});
export const stop = internalMutationGeneric({
  args: { userId: v.string(), appId: v.string() },
  returns: v.any(),
  handler: (ctx, args) =>
    (abortMessage as any)._handler(inertDispatch(ctx), args),
});

import {
  internalActionGeneric as fixtureAction,
  componentsGeneric,
} from "convex/server";
import { guardedEnqueue } from "../../../../backend/convex/agent/internal";
import { requireCredits } from "../../../../backend/convex/agent/credits";
import {
  claimWindow,
  sessionAllows,
  settle,
} from "../../../../backend/convex/agent/compute";

const paidScheduler = (ctx: any) => ({
  ...ctx,
  scheduler: {
    ...ctx.scheduler,
    runAfter: async (_delay: number, ref: any) => {
      const allowed = [
        "agent/actions/run:tick",
        "agent/compute:uncertain",
        "agent/actions/compute:stop",
        "agent/actions/compute:notice",
      ];
      if (!allowed.includes(getFunctionName(ref)))
        throw new Error("Unexpected paid fixture schedule");
      return ctx.scheduler.runAfter(0, anyApi.agentFixture.noop, {});
    },
    runAt: async (_time: number, ref: any) => {
      if (getFunctionName(ref) !== "agent/compute:boundary")
        throw new Error("Unexpected paid fixture scheduled boundary");
      return ctx.scheduler.runAfter(0, anyApi.agentFixture.noop, {});
    },
  },
});
export const paidApp = internalMutationGeneric({
  args: { userId: v.string(), appId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const thread = await ctx.runMutation(
      componentsGeneric().agent.threads.createThread,
      { userId: args.userId, title: "Synthetic paid fixture" },
    );
    await ctx.db.insert("apps", {
      appId: args.appId,
      userId: args.userId,
      name: "Synthetic paid fixture",
      platforms: ["web"],
      features: [],
      agent: {
        threadId: thread._id,
        status: "idle",
        pending: [],
        updatedAt: Date.now(),
      },
    });
    return thread._id;
  },
});
export const paidEnqueue = internalMutationGeneric({
  args: { userId: v.string(), appId: v.string(), prompt: v.string() },
  returns: v.any(),
  handler: (ctx, args) =>
    enqueueMessageHandler(paidScheduler(ctx), args, () => true, true),
});
export const paidSend = fixtureAction({
  args: {
    userId: v.string(),
    appId: v.string(),
    prompt: v.string(),
    balance: v.number(),
  },
  returns: v.any(),
  handler: (ctx, { balance, ...args }) =>
    guardedEnqueue(
      {
        ...ctx,
        runMutation: (ref: any, values: any) => {
          if (getFunctionName(ref) !== "agent/internal:enqueueMessage")
            throw new Error("Unexpected paid fixture mutation");
          return ctx.runMutation(anyApi.agentFixture.paidEnqueue, values);
        },
      } as any,
      args,
      (userId) =>
        requireCredits(
          userId,
          true,
          "fixture-only-noncredential",
          async (_unused, method, body) => {
            if (
              method !== "customers.get_or_create" ||
              body.customer_id !== userId
            )
              throw new Error("Unexpected inert credit lookup");
            return { balances: { credits: { remaining: balance } } };
          },
        ),
    ),
});
export const paidClaim = internalMutationGeneric({
  args: {
    sessionId: v.id("computeSessions"),
    expectedDebit: v.optional(v.id("computeDebits")),
  },
  returns: v.any(),
  handler: (ctx, args) => claimWindow(paidScheduler(ctx) as any, args, true),
});
export const paidUnknown = internalMutationGeneric({
  args: { debitId: v.id("computeDebits") },
  returns: v.any(),
  handler: (ctx, args) =>
    (settle as any)._handler(paidScheduler(ctx), {
      ...args,
      outcome: "unknown",
    }),
});
export const paidAllowed = internalMutationGeneric({
  args: { userId: v.string(), sessionId: v.id("computeSessions") },
  returns: v.boolean(),
  handler: (ctx, args) =>
    sessionAllows(ctx as any, args.sessionId, args.userId, Date.now(), true),
});
export const paidInspect = internalMutationGeneric({
  args: { userId: v.string(), appId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q: any) => q.eq("appId", args.appId))
      .unique();
    const sessions = await ctx.db
      .query("computeSessions")
      .withIndex("by_userId", (q: any) => q.eq("userId", args.userId))
      .take(20);
    const debits = sessions[0]
      ? await ctx.db
          .query("computeDebits")
          .withIndex("by_sessionId", (q: any) =>
            q.eq("sessionId", sessions[0]._id),
          )
          .take(20)
      : [];
    return { app, sessions, debits };
  },
});
export const paidUser = internalMutationGeneric({
  args: {},
  returns: v.id("users"),
  handler: (ctx) => ctx.db.insert("users", {}),
});

export const paidConfirm = internalMutationGeneric({
  args: { debitId: v.id("computeDebits") },
  returns: v.any(),
  handler: (ctx, args) =>
    (settle as any)._handler(paidScheduler(ctx), {
      ...args,
      outcome: "confirmed",
      responseBalance: 10,
    }),
});
export const paidAllowedAt = internalMutationGeneric({
  args: {
    userId: v.string(),
    sessionId: v.id("computeSessions"),
    now: v.number(),
  },
  returns: v.boolean(),
  handler: (ctx, args) =>
    sessionAllows(ctx as any, args.sessionId, args.userId, args.now, true),
});
export const paidExpire = internalMutationGeneric({
  args: { sessionId: v.id("computeSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { paidUntil: Date.now() - 1 });
    return null;
  },
});
