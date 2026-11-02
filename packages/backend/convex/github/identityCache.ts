import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

// Internal only: encrypted service identity, shared across action workers.
export const acquire = internalMutation({
  args: { key: v.string(), lease: v.string() },
  returns: v.object({
    token: v.optional(v.string()),
    acquired: v.boolean(),
    retryAfter: v.number(),
  }),
  handler: async (ctx, { key, lease }) => {
    const row = await ctx.db
      .query("serviceIdentities")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const now = Date.now();
    if (row?.token && row.expiresAt > now + 60_000)
      return { token: row.token, acquired: false, retryAfter: 0 };
    if (row && row.refreshAfter > now)
      return {
        acquired: false,
        retryAfter: Math.ceil((row.refreshAfter - now) / 1000),
      };
    const value = { lease, refreshAfter: now + 35_000 };
    if (row) await ctx.db.patch("serviceIdentities", row._id, value);
    else
      await ctx.db.insert("serviceIdentities", { key, expiresAt: 0, ...value });
    return { acquired: true, retryAfter: 0 };
  },
});

export const finish = internalMutation({
  args: {
    key: v.string(),
    lease: v.string(),
    token: v.optional(v.string()),
    expiresAt: v.number(),
    refreshAfter: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { key, lease, ...value }) => {
    const row = await ctx.db
      .query("serviceIdentities")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (row?.lease === lease)
      await ctx.db.patch("serviceIdentities", row._id, {
        ...value,
        lease: undefined,
      });
    return null;
  },
});
