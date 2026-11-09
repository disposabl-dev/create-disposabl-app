import {
  anyApi,
  mutationGeneric as mutation,
  queryGeneric as query,
} from "convex/server";
import { v } from "convex/values";

const link = v.object({
  anonymous: v.string(),
  distinct: v.string(),
  eventId: v.string(),
});
export const claim = mutation({
  args: {
    hash: v.optional(v.string()),
    newHash: v.string(),
    userId: v.optional(v.string()),
    link: v.optional(link),
  },
  handler: (ctx, args) => ctx.runMutation(anyApi.telemetry.claimIdentity, args),
});
export const begin = mutation({
  args: {
    id: v.id("telemetryIdentities"),
    eventId: v.string(),
    attempts: v.number(),
  },
  handler: (ctx, args) => ctx.runMutation(anyApi.telemetry.beginLink, args),
});
export const finish = mutation({
  args: {
    id: v.id("telemetryIdentities"),
    eventId: v.string(),
    success: v.boolean(),
  },
  handler: (ctx, args) => ctx.runMutation(anyApi.telemetry.finishLink, args),
});
export const lookup = query({
  args: { id: v.id("telemetryIdentities") },
  handler: (ctx, args) => ctx.runQuery(anyApi.telemetry.getLink, args),
});
export const identity = query({
  args: { hash: v.string() },
  handler: (ctx, { hash }) =>
    ctx.db
      .query("telemetryIdentities")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique(),
});
