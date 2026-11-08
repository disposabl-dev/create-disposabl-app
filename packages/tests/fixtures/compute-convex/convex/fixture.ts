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
  handler: (ctx, a) => ctx.db.patch(a.sessionId, { paidUntil: 0 }),
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
