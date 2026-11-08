// Public wrappers are strictly for this separate, disposable local deployment.
import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";
import {
  beginAttempt,
  finishAttempt,
  resolveAttempt,
  hasUnknownAttempt,
  hasPendingMonthlyAttempt,
} from "../../../../disposabl-kit/server/billing-functions";

const attempt = {
  userId: v.string(),
  purchase: v.union(v.literal("monthly"), v.literal("topup")),
  requestId: v.string(),
};
export const begin = mutation({
  args: attempt,
  handler: (ctx, args) => (beginAttempt as any)._handler(ctx, args),
});
export const finish = mutation({
  args: { ...attempt, url: v.string() },
  handler: (ctx, args) => (finishAttempt as any)._handler(ctx, args),
});
export const resolve = mutation({
  args: {
    userId: v.string(),
    requestId: v.string(),
    outcome: v.union(
      v.literal("completed"),
      v.literal("expired"),
      v.literal("cancelled"),
      v.literal("not_charged"),
    ),
    evidence: v.string(),
  },
  handler: (ctx, args) => (resolveAttempt as any)._handler(ctx, args),
});
export const state = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => ({
    unknown: await (hasUnknownAttempt as any)._handler(ctx, args),
    monthlyPending: await (hasPendingMonthlyAttempt as any)._handler(ctx, args),
    rows: await ctx.db
      .query("billingAttempts")
      .withIndex("by_userId_requestId", (q) => q.eq("userId", args.userId))
      .take(100),
  }),
});
