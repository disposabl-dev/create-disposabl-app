// Test-only physical row probe injected into the isolated component copy.
import { query } from "./_generated/server.js";
import { v } from "convex/values";
export const records = query({
  args: { grantId: v.id("grants"), hash: v.string() },
  returns: v.any(),
  handler: async (ctx, { grantId, hash }) => ({
    grant: await ctx.db.get("grants", grantId),
    token: await ctx.db
      .query("tokens")
      .withIndex("hash", (q) => q.eq("hash", hash))
      .unique(),
  }),
});
