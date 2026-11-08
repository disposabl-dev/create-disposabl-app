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
