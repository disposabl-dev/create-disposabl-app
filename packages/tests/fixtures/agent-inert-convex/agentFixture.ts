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

// Synthetic apps are created only in the disposable fixture backend.
export const createAccessApp = internalMutationGeneric({
  args: { appId: v.string(), userId: v.string() },
  returns: v.string(),
  handler: async (ctx, { appId, userId }) => {
    const thread = await ctx.runMutation(
      componentsGeneric().agent.threads.createThread,
      { userId, title: "Synthetic access fixture" },
    );
    await ctx.db.insert("apps", {
      appId,
      userId,
      name: "Synthetic access fixture",
      platforms: ["web"],
      agent: {
        threadId: thread._id,
        status: "processing",
        pending: [],
        updatedAt: Date.now(),
      },
    });
    return thread._id;
  },
});
export const setUnconfirmed = internalMutationGeneric({
  args: { appId: v.string(), userId: v.string(), value: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { appId, userId, value }) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q: any) => q.eq("appId", appId))
      .unique();
    if (!app?.agent || app.userId !== userId)
      throw new Error("Fixture app unavailable");
    await ctx.db.patch(app._id, {
      agent: { ...app.agent, stopUnconfirmed: value },
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
        "agent/activation:expired",
      ];
      if (!allowed.includes(getFunctionName(ref)))
        throw new Error("Unexpected paid fixture schedule");
      return ctx.scheduler.runAfter(0, anyApi.agentFixture.noop, {});
    },
    runAt: async (_time: number, ref: any) => {
      if (
        !["agent/compute:boundary", "agent/actions/compute:stop"].includes(
          getFunctionName(ref),
        )
      )
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

import {
  claimActivation,
  completeActivation,
  archiveStop,
} from "../../../../backend/convex/agent/activation";
import { stopping } from "../../../../backend/convex/agent/compute";
export const activationClaim = internalMutationGeneric({
  args: { sessionId: v.id("computeSessions"), token: v.string() },
  returns: v.any(),
  handler: (ctx, args) => claimActivation(paidScheduler(ctx) as any, args),
});
export const activationComplete = internalMutationGeneric({
  args: { sessionId: v.id("computeSessions"), token: v.string() },
  returns: v.boolean(),
  handler: (ctx, args) => completeActivation(paidScheduler(ctx) as any, args),
});
export const activationArchive = internalMutationGeneric({
  args: { sessionId: v.id("computeSessions") },
  returns: v.boolean(),
  handler: (ctx, args) => archiveStop(paidScheduler(ctx) as any, args),
});
export const activationStop = internalMutationGeneric({
  args: { sessionId: v.id("computeSessions"), token: v.string() },
  returns: v.boolean(),
  handler: (ctx, args) => (stopping as any)._handler(paidScheduler(ctx), args),
});
export const activationExpireLease = internalMutationGeneric({
  args: { sessionId: v.id("computeSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.sessionId);
    if (!row?.activationLease) throw Error("missing fixture lease");
    await ctx.db.patch(args.sessionId, {
      activationLease: { ...row.activationLease, until: Date.now() - 1 },
    });
    return null;
  },
});

export const activationSeedLegacy = internalMutationGeneric({
  args: { userId: v.string(), count: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, count }) => {
    for (let i = 0; i < count; i++)
      await ctx.db.insert("apps", {
        userId,
        appId: `legacy-${userId}-${i}`,
        name: "Synthetic legacy",
        platforms: ["web"],
      });
    return null;
  },
});
export const activationLegacyDelivery = internalMutationGeneric({
  args: { userId: v.string(), index: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q: any) =>
        q.eq("appId", `legacy-${args.userId}-${args.index}`),
      )
      .unique();
    if (!app) throw Error("missing synthetic app");
    await ctx.db.patch(app._id, {
      agent: {
        threadId: `legacy-${args.index}`,
        status: "failed",
        pending: [],
        updatedAt: Date.now(),
        delivery: "synthetic-unknown",
      },
      agentRemoteUnresolved: undefined,
      agentResumeBusy: undefined,
    });
    return null;
  },
});

import {
  normalizeRemoteWork,
  patchThread,
  readThread,
} from "../../../../backend/convex/agent/threads";
import {
  claimDeletionStop,
  finishDeletionStop,
} from "../../../../backend/convex/users/internal";
import { stopped } from "../../../../backend/convex/agent/compute";
export const activationNormalize = internalMutationGeneric({
  args: { userId: v.string() },
  returns: v.any(),
  handler: (ctx, args) => normalizeRemoteWork(ctx as any, args.userId),
});
export const activationPatchApp = internalMutationGeneric({
  args: { appId: v.string(), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q: any) => q.eq("appId", args.appId))
      .unique();
    const thread = readThread(app as any);
    if (!thread || thread.userId !== args.userId)
      throw Error("fixture ownership");
    await patchThread(ctx as any, thread, {
      delivery: "simultaneous-delivery",
    });
    return null;
  },
});
export const activationDrainApp = internalMutationGeneric({
  args: { appId: v.string(), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_appId", (q: any) => q.eq("appId", args.appId))
      .unique();
    const thread = readThread(app as any);
    if (!thread || thread.userId !== args.userId)
      throw Error("fixture ownership");
    await patchThread(ctx as any, thread, {
      status: "idle",
      pending: [],
      lease: undefined,
    });
    return null;
  },
});
export const activationStopComplete = internalMutationGeneric({
  args: { sessionId: v.id("computeSessions"), token: v.string() },
  returns: v.any(),
  handler: (ctx, args) =>
    (stopped as any)._handler(paidScheduler(ctx), { ...args, archived: true }),
});
export const deletionSeed = internalMutationGeneric({
  args: { userId: v.id("users") },
  returns: v.any(),
  handler: async (ctx, { userId }) => {
    await ctx.db.patch(userId, { deletionRequestedAt: Date.now() });
    const old = await ctx.db.insert("computeSessions", {
      userId,
      state: "active",
      paidUntil: Date.now() + 60000,
      activation: "claimed",
      activationLease: { token: "old", until: Date.now() + 60000 },
    });
    await ctx.db.insert("computeSessions", {
      userId,
      state: "stopped",
      paidUntil: 0,
    });
    const watchdog = await ctx.scheduler.runAfter(
      0,
      anyApi.agentFixture.noop,
      {},
    );
    const app = await ctx.db.insert("apps", {
      userId,
      appId: `deletion-${userId}`,
      name: "fixture",
      platforms: ["web"],
      agent: {
        threadId: "fixture",
        status: "processing",
        pending: [],
        updatedAt: Date.now(),
        lease: { token: "old-worker", watchdog, expiresAt: Date.now() + 60000 },
      },
    });
    return { old, app };
  },
});
export const deletionExpire = internalMutationGeneric({
  args: { old: v.id("computeSessions"), app: v.id("apps"), kind: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.kind === "activation") {
      const row = await ctx.db.get(args.old);
      if (!row?.activationLease) throw Error("fixture");
      await ctx.db.patch(args.old, {
        activationLease: { ...row.activationLease, until: Date.now() - 1 },
      });
    } else {
      const row = await ctx.db.get(args.app);
      if (!row?.agent?.lease) throw Error("fixture");
      await ctx.db.patch(args.app, {
        agent: {
          ...row.agent,
          lease: { ...row.agent.lease, expiresAt: Date.now() - 1 },
        },
      });
    }
    return null;
  },
});
export const deletionRenewWorker = internalMutationGeneric({
  args: { app: v.id("apps") },
  returns: v.null(),
  handler: async (ctx, { app }) => {
    const row = await ctx.db.get(app);
    if (!row?.agent?.lease) throw Error("fixture");
    await ctx.db.patch(app, {
      agent: {
        ...row.agent,
        lease: { ...row.agent.lease, expiresAt: Date.now() + 60000 },
      },
    });
    return null;
  },
});
export const deletionClaim = internalMutationGeneric({
  args: { userId: v.id("users"), token: v.string() },
  returns: v.boolean(),
  handler: (ctx, args) => (claimDeletionStop as any)._handler(ctx, args),
});
export const deletionFinish = internalMutationGeneric({
  args: { userId: v.id("users"), token: v.string() },
  returns: v.boolean(),
  handler: (ctx, args) =>
    (finishDeletionStop as any)._handler(ctx, {
      ...args,
      outcome: "archived_observed",
    }),
});

// Model an older lease write that did not update the derived busy flag.
export const activationSeedWorker = internalMutationGeneric({
  args: { appId: v.string(), userId: v.string(), sessionId: v.id("computeSessions"), token: v.string(), expire: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const app = await ctx.db.query("apps").withIndex("by_appId", (q: any) => q.eq("appId", args.appId)).unique();
    if (!app?.agent || app.userId !== args.userId) throw Error("fixture ownership");
    const watchdog = await ctx.scheduler.runAfter(3600000, anyApi.agentFixture.noop, {});
    await ctx.db.patch(app._id, { agentResumeBusy: false, agentRemoteUnresolved: false, agent: { ...app.agent, computeSessionId: args.sessionId, lease: { token: args.token, watchdog, expiresAt: Date.now() + (args.expire ? -1 : 60000) } } });
    return null;
  },
});

import { claim as workerClaim } from "../../../../backend/convex/agent/state";
export const paidWorkerClaim = internalMutationGeneric({
  args: { id: v.string(), token: v.string(), activationProtocol: v.optional(v.literal(1)) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const scheduled: string[] = [];
    const result = await (workerClaim as any)._handler({
      ...ctx,
      scheduler: {
        ...ctx.scheduler,
        runAfter: async (_delay: number, ref: any) => {
          const name = getFunctionName(ref);
          if (name !== "agent/actions/run:tick") throw Error("unexpected claim schedule");
          scheduled.push(name);
          return ctx.scheduler.runAfter(3600000, anyApi.agentFixture.noop, {});
        },
      },
    }, args);
    return { result, scheduled };
  },
});
