import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  telemetryIssuance: defineTable({
    key: v.literal("global"),
    tokens: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  telemetryIdentities: defineTable({
    hash: v.string(),
    userId: v.optional(v.string()),
    expiresAt: v.number(),
  }).index("by_hash", ["hash"]),
});
