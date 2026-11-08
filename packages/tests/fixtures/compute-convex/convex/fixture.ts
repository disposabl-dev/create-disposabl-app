import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";
import { resolve } from "../../../../backend/convex/agent/computeRecovery";
export const resolveHold = mutation({
  args: {
    sessionId: v.id("computeSessions"),
    debitId: v.id("computeDebits"),
    outcome: v.union(v.literal("confirmed"), v.literal("denied")),
    evidence: v.string(),
    operator: v.string(),
  },
  handler: (ctx, args) => (resolve as any)._handler(ctx, args),
});
import {
  admitSession,
  claimWindow,
  scheduleBoundary,
  settle,
  uncertain,
  stopping,
  stopped,
  sessionAllows,
} from "../../../../backend/convex/agent/compute";
export const admit = mutation({
  args: { userId: v.string() },
  handler: (ctx, { userId }) => admitSession(ctx as any, userId, true),
});
export const app = mutation({
  args: {
    userId: v.string(),
    sessionId: v.id("computeSessions"),
    threadId: v.string(),
  },
  handler: (ctx, a) =>
    ctx.db.insert("apps", {
      appId: a.threadId,
      name: "fixture",
      platforms: ["web"],
      userId: a.userId,
      agent: {
        threadId: a.threadId,
        computeSessionId: a.sessionId,
        status: "processing",
        pending: [],
        updatedAt: Date.now(),
      },
    }),
});
export const claim = mutation({
  args: {
    sessionId: v.id("computeSessions"),
    expectedDebit: v.optional(v.id("computeDebits")),
  },
  handler: (ctx, a) => claimWindow(ctx as any, a, true),
});
// Models a renewal already dispatched by the previous implementation.
export const inFlightRenewal = mutation({
  args: { sessionId: v.id("computeSessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.state !== "active") throw new Error("Not active");
    const debitId = await ctx.db.insert("computeDebits", {
      sessionId,
      state: "dispatching",
      paidUntil: Date.now() + 600_000,
    });
    await ctx.db.patch(sessionId, { debitId });
    return ctx.db.get(debitId);
  },
});
export const boundary = mutation({
  args: {
    sessionId: v.id("computeSessions"),
    expectedDebit: v.id("computeDebits"),
  },
  handler: (ctx, args) => scheduleBoundary(ctx as any, args, true),
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
  handler: (ctx, a) => (settle as any)._handler(ctx, a),
});
export const crash = mutation({
  args: { debitId: v.id("computeDebits") },
  handler: (ctx, args) => (uncertain as any)._handler(ctx, args),
});
export const stop = mutation({
  args: { sessionId: v.id("computeSessions"), token: v.string() },
  handler: (ctx, a) => (stopping as any)._handler(ctx, a),
});
export const stoppedResult = mutation({
  args: {
    sessionId: v.id("computeSessions"),
    token: v.string(),
    archived: v.boolean(),
  },
  handler: (ctx, a) => (stopped as any)._handler(ctx, a),
});
export const expire = mutation({
  args: { sessionId: v.id("computeSessions") },
  handler: (ctx, a) => ctx.db.patch(a.sessionId, { paidUntil: Date.now() - 1 }),
});
export const beginStop = mutation({
  args: { sessionId: v.id("computeSessions") },
  handler: (ctx, { sessionId }) =>
    ctx.db.patch(sessionId, { state: "stopping" }),
});
export const get = query({
  args: { sessionId: v.id("computeSessions") },
  handler: (ctx, a) => ctx.db.get(a.sessionId),
});
export const debits = query({
  args: { sessionId: v.id("computeSessions") },
  handler: (ctx, a) =>
    ctx.db
      .query("computeDebits")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", a.sessionId))
      .collect(),
});
export const allowed = query({
  args: {
    sessionId: v.id("computeSessions"),
    userId: v.string(),
    now: v.number(),
  },
  handler: (ctx, a) =>
    sessionAllows(ctx as any, a.sessionId, a.userId, a.now, true),
});

import { append } from "../../../../backend/convex/agent/state";
import { issue, authenticate } from "../../../../backend/convex/agent/access";
import { makeFunctionReference } from "convex/server";
export const worker = mutation({
  args: { appId: v.id("apps"), token: v.string(), expiresAt: v.number() },
  handler: async (ctx, a) => {
    const app = await ctx.db.get(a.appId);
    const watchdog = await ctx.scheduler.runAfter(
      3600000,
      makeFunctionReference<"mutation">("agent/compute:noop"),
      {},
    );
    await ctx.db.patch(a.appId, {
      agent: {
        ...app!.agent!,
        lease: { token: a.token, expiresAt: a.expiresAt, watchdog },
      },
    });
  },
});
export const appendEvents = mutation({
  args: { id: v.string(), token: v.string() },
  handler: (ctx, a) => (append as any)._handler(ctx, { ...a, events: [] }),
});
export const issueAccess = mutation({
  args: { id: v.string(), token: v.string(), hash: v.string() },
  handler: (ctx, a) => (issue as any)._handler(ctx, a),
});
export const auth = query({
  args: { hash: v.string() },
  handler: (ctx, a) => (authenticate as any)._handler(ctx, a),
});
export const setStatus = mutation({
  args: {
    appId: v.id("apps"),
    status: v.union(v.literal("processing"), v.literal("idle")),
  },
  handler: async (ctx, a) => {
    const app = await ctx.db.get(a.appId);
    await ctx.db.patch(a.appId, {
      agent: { ...app!.agent!, status: a.status, lease: undefined },
    });
  },
});

export const expireAccess = mutation({
  args: { appId: v.id("apps") },
  handler: async (ctx, a) => {
    const app = await ctx.db.get(a.appId);
    await ctx.db.patch(a.appId, {
      agent: {
        ...app!.agent!,
        access: { ...app!.agent!.access!, expiresAt: 0 },
      },
    });
  },
});

import { saveMessage } from "@convex-dev/agent";
import { components } from "../../../../backend/convex/_generated/api";
import {
  claim as claimWorker,
  finish,
} from "../../../../backend/convex/agent/state";
import {
  getThread,
  patchThread,
  assertSessionRebind,
} from "../../../../backend/convex/agent/threads";
export const queuedApp = mutation({
  args: { userId: v.string(), sessionId: v.id("computeSessions") },
  handler: async (ctx, a) => {
    const thread = await ctx.runMutation(
      components.agent.threads.createThread,
      { userId: a.userId },
    );
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: thread._id,
      userId: a.userId,
      message: { role: "user", content: "old work" },
    });
    const appId = await ctx.db.insert("apps", {
      appId: thread._id,
      name: "queued fixture",
      platforms: ["web"],
      userId: a.userId,
      agent: {
        threadId: thread._id,
        computeSessionId: a.sessionId,
        status: "processing",
        pending: [messageId],
        updatedAt: Date.now(),
      },
    });
    return { appId, threadId: thread._id, messageId };
  },
});
export const claimWorkerLease = mutation({
  args: { id: v.string(), token: v.string() },
  handler: (ctx, args) => (claimWorker as any)._handler(ctx, args),
});
export const suspendWorker = mutation({
  args: { id: v.string(), token: v.string() },
  handler: (ctx, args) =>
    (finish as any)._handler(ctx, { ...args, suspended: true }),
});
export const enqueueSameApp = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const current = (await getThread(ctx as any, id))!;
    const sessionId = await admitSession(ctx as any, current.userId, true);
    assertSessionRebind(current, sessionId);
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: id,
      userId: current.userId,
      message: { role: "user", content: "new work" },
    });
    await patchThread(ctx as any, current, {
      computeSessionId: sessionId,
      pending: [...current.pending, messageId],
      status: "processing",
      delivery: undefined,
      promptId: undefined,
    });
    return { sessionId, messageId };
  },
});
export const messages = query({
  args: { ids: v.array(v.string()) },
  handler: (ctx, { ids }) =>
    ctx.runQuery(components.agent.messages.getMessagesByIds, {
      messageIds: ids,
    }),
});
