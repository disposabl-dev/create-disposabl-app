import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";

// Only the scheduled renewal adapter calls this. No provider is contacted.
export const debit = mutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const previous = await ctx.db
      .query("fixtureElapsedCharges")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(3);
    const ordinal = previous.length + 1;
    await ctx.db.insert("fixtureElapsedCharges", {
      userId,
      ordinal,
      observedAt: Date.now(),
    });
    return ordinal === 1
      ? { outcome: "confirmed" as const, responseBalance: 4 }
      : { outcome: "denied" as const };
  },
});
export const charges = query({
  args: { userId: v.string() },
  handler: (ctx, { userId }) =>
    ctx.db
      .query("fixtureElapsedCharges")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(3),
});
