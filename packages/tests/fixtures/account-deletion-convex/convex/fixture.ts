import { register as registerFileHandler } from "../../../../backend/convex/files/internal";
import {
  save as saveConnectionHandler,
  begin as beginConnectionHandler,
  consume as consumeConnectionHandler,
} from "../../../../backend/convex/connections/internal";
import {
  refresh,
  select,
} from "../../../../backend/convex/connections/posthog";
import { connect as githubConnect } from "../../../../backend/convex/github/internal";
import { get as nativeAppGet } from "../../../../backend/convex/apps/index";
import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";
import {
  requestDeletion,
  deletionStatus,
} from "../../../../backend/convex/users/index";
import {
  deletionPending,
  requireNotDeleting,
  getActiveSessionUserId,
} from "../../../../backend/convex/users/deletion";
import {
  deletionRequests,
  claimDeletionStop,
  finishDeletionStop,
} from "../../../../backend/convex/users/internal";
const identity = (ctx: any, userId: string | null) => ({
  ...ctx,
  auth: {
    getUserIdentity: async () =>
      userId ? { subject: "fixture-session" } : null,
  },
  runQuery: async () => (userId ? { userId } : null),
});
export const create = mutation({
  args: { label: v.string() },
  handler: (ctx, args) => ctx.db.insert("users", args),
});
export const request = mutation({
  args: { userId: v.union(v.id("users"), v.null()), confirmation: v.string() },
  handler: (ctx, args) =>
    (requestDeletion as any)._handler(identity(ctx, args.userId), {
      confirmation: args.confirmation,
    }),
});
export const status = query({
  args: { userId: v.union(v.id("users"), v.null()) },
  handler: (ctx, args) =>
    (deletionStatus as any)._handler(identity(ctx, args.userId), {}),
});
export const pending = query({
  args: { userId: v.id("users") },
  handler: (ctx, args) => deletionPending(ctx as any, args.userId),
});
export const queue = query({
  args: {},
  handler: (ctx) =>
    (deletionRequests as any)._handler(ctx, {
      paginationOpts: { numItems: 100, cursor: null },
    }),
});

export const attemptWork = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireNotDeleting(ctx as any, userId);
    const user = await ctx.db.get(userId);
    await ctx.db.patch(userId, { label: user!.label + "-work" });
    return null;
  },
});

export const claimStop = mutation({
  args: { userId: v.id("users"), token: v.string() },
  handler: (ctx, args) => (claimDeletionStop as any)._handler(ctx, args),
});
export const finishStop = mutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    outcome: v.union(
      v.literal("unknown"),
      v.literal("failed"),
      v.literal("archived_observed"),
    ),
  },
  handler: (ctx, args) => (finishDeletionStop as any)._handler(ctx, args),
});
export const expireStop = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user?.deletionStop) throw new Error("No attempt");
    await ctx.db.patch(userId, {
      deletionStop: { ...user.deletionStop, leaseUntil: Date.now() - 1 },
    });
  },
});

export const active = query({
  args: { userId: v.union(v.id("users"), v.null()) },
  handler: (ctx, { userId }) =>
    getActiveSessionUserId({
      ...identity(ctx, userId),
      runQuery: async (_ref: unknown, args: any) =>
        "sessionId" in args
          ? userId
            ? { userId }
            : null
          : deletionPending(ctx as any, args.userId),
    } as any),
});

export const nativeApp = query({
  args: { userId: v.union(v.id("users"), v.null()) },
  handler: async (ctx, { userId }) => {
    return (nativeAppGet as any)._handler(
      {
        ...identity(ctx, userId),
        runQuery: async (_ref: unknown, args: any) => {
          if ("sessionId" in args) return userId ? { userId } : null;
          if (!("appId" in args))
            return deletionPending(ctx as any, args.userId);
          return { appId: args.appId, userId: args.userId };
        },
      },
      { appId: "fixture" },
    );
  },
});

export const saveConnection = mutation({
  args: { userId: v.id("users"), token: v.string() },
  handler: (ctx, a) =>
    (saveConnectionHandler as any)._handler(ctx, {
      userId: a.userId,
      provider: "posthog",
      accountId: "a",
      name: "fixture",
      token: a.token,
    }),
});
export const refreshConnection = mutation({
  args: { userId: v.id("users"), previous: v.string(), next: v.string() },
  handler: (ctx, a) => (refresh as any)._handler(ctx, a),
});
export const selectConnection = mutation({
  args: { userId: v.id("users"), token: v.string() },
  handler: (ctx, a) =>
    (select as any)._handler(ctx, { ...a, accountId: "new", name: "new" }),
});
export const githubConnection = mutation({
  args: { userId: v.id("users") },
  handler: (ctx, a) =>
    (githubConnect as any)._handler(ctx, {
      ...a,
      owner: "fixture",
      installationId: "123",
    }),
});
export const beginConnection = mutation({
  args: { userId: v.id("users") },
  handler: (ctx, a) =>
    (beginConnectionHandler as any)._handler(ctx, {
      ...a,
      provider: "convex",
      hash: "fixture",
      verifier: "fixture",
    }),
});
export const consumeConnection = mutation({
  args: { userId: v.id("users") },
  handler: (ctx, a) =>
    (consumeConnectionHandler as any)._handler(ctx, {
      ...a,
      provider: "convex",
      hash: "fixture",
    }),
});
export const registerFile = mutation({
  args: { userId: v.id("users") },
  handler: (ctx, a) =>
    (registerFileHandler as any)._handler(identity(ctx, a.userId), {
      filename: "test.txt",
      mediaType: "text/plain",
      size: 1,
      location: {
        provider: "r2",
        key: "fixture",
        account: "fixture",
        bucket: "fixture",
      },
    }),
});
export const owned = query({
  args: { userId: v.id("users") },
  handler: async (ctx, a) => ({
    files: await ctx.db
      .query("files")
      .withIndex("by_owner", (q) => q.eq("owner", a.userId))
      .take(100),
    connections: await ctx.db
      .query("connections")
      .withIndex("by_userId_provider", (q) => q.eq("userId", a.userId))
      .take(100),
    github: await ctx.db
      .query("githubConnections")
      .withIndex("by_userId_owner", (q) => q.eq("userId", a.userId))
      .take(100),
  }),
});
