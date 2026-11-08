import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  billingHandoffs: defineTable({
    hash: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    purchase: v.optional(v.union(v.literal("monthly"), v.literal("topup"))),
    returnChannel: v.optional(v.string()),
    browserSessionId: v.optional(v.string()),
    returnExpiresAt: v.optional(v.number()),
    expiresAt: v.number(),
  }).index("by_hash", ["hash"]),
});
