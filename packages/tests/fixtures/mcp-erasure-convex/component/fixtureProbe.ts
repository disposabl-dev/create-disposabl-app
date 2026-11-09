// Added to the disposable candidate copy only, never to the distributable patch.
import { v } from "convex/values";
import { query } from "./_generated/server.js";

export const countTokens = query({
  args: { grantId: v.id("grants") },
  returns: v.number(),
  handler: async (ctx, { grantId }) =>
    (
      await ctx.db
        .query("tokens")
        .withIndex("grantId", (q) => q.eq("grantId", grantId))
        .take(2001)
    ).length,
});
