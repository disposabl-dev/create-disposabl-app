import {
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";
import { requestDeletion } from "../../../../backend/convex/users/index";
import { claimIdentity } from "../../../../backend/convex/telemetry";
import { claimIdentity as generic } from "../../../../disposabl-kit/server/lib/telemetry";
export const create = mutation({
  args: {},
  handler: (ctx) => ctx.db.insert("users", { label: "synthetic" }),
});
export const request = mutation({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) =>
    (requestDeletion as any)._handler(
      {
        ...ctx,
        auth: { getUserIdentity: async () => ({ subject: "fixture" }) },
        runQuery: async () => ({ userId }),
      },
      { confirmation: "DELETE" },
    ),
});
export const claim = mutation({
  args: {
    userId: v.optional(v.string()),
    hash: v.optional(v.string()),
    newHash: v.string(),
    generic: v.optional(v.boolean()),
  },
  handler: (ctx, { generic: useGeneric, ...args }) =>
    ((useGeneric ? generic : claimIdentity) as any)._handler(ctx, args),
});
export const rows = query({
  args: {},
  handler: async (ctx) => ({
    identities: await ctx.db.query("telemetryIdentities").collect(),
    buckets: await ctx.db.query("telemetryIssuance").collect(),
  }),
});
export const clear = mutation({
  args: { hash: v.string() },
  handler: async (ctx, { hash }) => {
    const row = await ctx.db
      .query("telemetryIdentities")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});
export const removeUser = mutation({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) => ctx.db.delete(userId),
});
