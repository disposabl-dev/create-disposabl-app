import {
  identityFields,
  internalMutation,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";

// A refresh token may be single-use. Only one action refreshes this connection.
export const refresh = internalMutation({
  args: {
    ...identityFields,
    previous: v.string(),
    next: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, { userId, previous, next }) => {
    const row = await ctx.db
      .query("connections")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", userId).eq("provider", "posthog"),
      )
      .unique();
    if (!row || row.token !== previous) return false;
    if (next !== undefined) {
      await ctx.db.patch("connections", row._id, {
        token: next,
        refreshingUntil: undefined,
      });
      return true;
    }
    if ((row.refreshingUntil ?? 0) > Date.now()) return false;
    await ctx.db.patch("connections", row._id, {
      refreshingUntil: Date.now() + 60_000,
    });
    return true;
  },
});

export const select = internalMutation({
  args: {
    ...identityFields,
    token: v.string(),
    accountId: v.string(),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, token, accountId, name }) => {
    const row = await ctx.db
      .query("connections")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", userId).eq("provider", "posthog"),
      )
      .unique();
    if (!row || row.token !== token)
      throw new ConvexError(
        "PostHog access changed. Connect again to choose an organization.",
      );
    await ctx.db.patch("connections", row._id, { accountId, name });
    return null;
  },
});
