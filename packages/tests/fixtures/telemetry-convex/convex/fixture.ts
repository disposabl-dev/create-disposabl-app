import { mutationGeneric as mutation } from "convex/server";
import { v } from "convex/values";
import { claimIdentity } from "../../../../disposabl-kit/server/lib/telemetry";

// Test-only callers supply the already-verified user ID that the HTTP action
// obtains from Convex Auth. This wrapper must never ship in generated apps.
export const claim = mutation({
  args: {
    hash: v.optional(v.string()),
    newHash: v.string(),
    userId: v.optional(v.string()),
  },
  returns: v.union(v.boolean(), v.null()),
  handler: (ctx, args) => (claimIdentity as any)._handler(ctx, args),
});

export const expire = mutation({
  args: { hash: v.string() },
  returns: v.null(),
  handler: async (ctx, { hash }) => {
    const row = await ctx.db
      .query("telemetryIdentities")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (row) await ctx.db.patch(row._id, { expiresAt: 0 });
    return null;
  },
});

// Test-only bucket controls, for deterministic contention and exhaustion.
export const setBudget = mutation({
  args: { tokens: v.number() },
  returns: v.null(),
  handler: async (ctx, { tokens }) => {
    const row = await ctx.db
      .query("telemetryIssuance")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    const value = { tokens, updatedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, value);
    else await ctx.db.insert("telemetryIssuance", { key: "global", ...value });
    return null;
  },
});
