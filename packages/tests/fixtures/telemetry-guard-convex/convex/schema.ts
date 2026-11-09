import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  users: defineTable({
    label: v.string(),
    deletionRequestedAt: v.optional(v.number()),
  }),
  deletionReceipts: defineTable({
    reference: v.string(),
    ownerId: v.string(),
    requestedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_reference", ["reference"]),
  telemetryIdentities: defineTable({
    hash: v.string(),
    expiresAt: v.number(),
    userId: v.optional(v.string()),
  }).index("by_hash", ["hash"]),
  telemetryIssuance: defineTable({
    key: v.string(),
    tokens: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
