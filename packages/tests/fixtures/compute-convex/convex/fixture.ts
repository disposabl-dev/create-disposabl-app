import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";
import {
  claimActivation as claimRealActivation,
  completeActivation as completeRealActivation,
} from "../../../../backend/convex/agent/activation";
export const claimActivation = mutation({
  args: { sessionId: v.id("computeSessions"), token: v.string() },
  handler: (ctx, args) => claimRealActivation(ctx as any, args),
});
export const completeActivation = mutation({
  args: { sessionId: v.id("computeSessions"), token: v.string() },
  handler: (ctx, args) => completeRealActivation(ctx as any, args),
});
import {
  resolve,
  resolveConflicts,
} from "../../../../backend/convex/agent/computeRecovery";
export const resolveConflictsHold = mutation({
  args: {
    currentSessionId: v.id("computeSessions"),
    conflicts: v.array(
      v.object({
        sessionId: v.id("computeSessions"),
        debitId: v.id("computeDebits"),
        evidence: v.string(),
      }),
    ),
    operator: v.string(),
    currentDebit: v.optional(
      v.object({
        debitId: v.id("computeDebits"),
        outcome: v.union(v.literal("confirmed"), v.literal("denied")),
        evidence: v.string(),
      }),
    ),
  },
  handler: (ctx, args) => (resolveConflicts as any)._handler(ctx, args),
});
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
  workBlocked,
} from "../../../../backend/convex/agent/compute";
export const admit = mutation({
  args: { userId: v.string(), enabled: v.optional(v.boolean()) },
  handler: (ctx, { userId, enabled }) =>
    admitSession(ctx as any, userId, enabled ?? true),
});
export const sessions = query({
  args: { userId: v.string() },
  handler: (ctx, { userId }) =>
    ctx.db
      .query("computeSessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(10),
});
export const setStopUnconfirmed = mutation({
  args: { appId: v.id("apps"), value: v.boolean() },
  handler: async (ctx, { appId, value }) => {
    const app = await ctx.db.get(appId);
    if (!app?.agent) throw new Error("Missing fixture agent");
    await ctx.db.patch(appId, {
      agent: { ...app.agent, stopUnconfirmed: value },
    });
  },
});
export const seedUser = mutation({
  args: {},
  returns: v.id("users"),
  handler: (ctx) => ctx.db.insert("users", {}),
});
// Model a displaced in-flight dispatch without inventing a confirmed provider stop.
export const seedNewerSession = mutation({
  args: { userId: v.string() },
  returns: v.id("computeSessions"),
  handler: (ctx, { userId }) =>
    ctx.db.insert("computeSessions", {
      userId,
      state: "starting",
      paidUntil: 0,
    }),
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
// Model an inconsistent starting session while preserving the confirmed debit.
export const setStartingWithDebit = mutation({
  args: { sessionId: v.id("computeSessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    const debit = session?.debitId && (await ctx.db.get(session.debitId));
    if (!session || session.state !== "active" || debit?.state !== "confirmed")
      throw new Error("Expected a confirmed active session");
    await ctx.db.patch(sessionId, { state: "starting", paidUntil: 0 });
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
// Move both sides of a confirmed synthetic window to its boundary.
export const expireFundedWindow = mutation({
  args: { sessionId: v.id("computeSessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    const debit = session?.debitId && (await ctx.db.get(session.debitId));
    if (
      !session ||
      session.state !== "active" ||
      !debit ||
      debit.state !== "confirmed"
    )
      throw new Error("Expected a confirmed active window");
    const paidUntil = Date.now() - 1;
    await ctx.db.patch(sessionId, { paidUntil });
    await ctx.db.patch(debit._id, { paidUntil });
  },
});
export const beginStop = mutation({
  args: { sessionId: v.id("computeSessions") },
  handler: (ctx, { sessionId }) =>
    ctx.db.patch(sessionId, { state: "stopping" }),
});

// Test-only denied operations for late-confirmation and overflow scenarios.
export const seedDeniedDebits = mutation({
  args: { sessionId: v.id("computeSessions"), count: v.number() },
  handler: async (ctx, { sessionId, count }) => {
    if (!Number.isInteger(count) || count < 1 || count > 101)
      throw new Error("Invalid fixture count");
    const ids = [];
    for (let i = 0; i < count; i++)
      ids.push(
        await ctx.db.insert("computeDebits", {
          sessionId,
          state: "denied",
          paidUntil: 1,
        }),
      );
    return ids;
  },
});
export const inconsistentConflictHold = mutation({
  args: { sessionId: v.id("computeSessions"), empty: v.boolean() },
  handler: (ctx, { sessionId, empty }) =>
    ctx.db.patch(sessionId, {
      state: "hold",
      reconciliationConflict: true,
      conflictDebits: empty ? [] : undefined,
      untrackedConflicts: undefined,
    }),
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
    enabled: v.optional(v.boolean()),
  },
  handler: (ctx, a) =>
    sessionAllows(ctx as any, a.sessionId, a.userId, a.now, a.enabled ?? true),
});
export const blocked = query({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: (ctx, args) => (workBlocked as any)._handler(ctx, args),
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
  args: {
    id: v.string(),
    token: v.string(),
    userId: v.string(),
    appId: v.string(),
    hash: v.string(),
  },
  handler: (ctx, a) => (issue as any)._handler(ctx, a),
});
export const auth = query({
  args: { hash: v.string() },
  handler: (ctx, a) => (authenticate as any)._handler(ctx, a),
});
export const setStatus = mutation({
  args: {
    appId: v.id("apps"),
    status: v.union(
      v.literal("processing"),
      v.literal("stopping"),
      v.literal("idle"),
    ),
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
