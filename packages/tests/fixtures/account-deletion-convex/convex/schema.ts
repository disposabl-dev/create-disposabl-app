import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  users: defineTable({
    deletionRequestedAt: v.optional(v.number()),
    deletionStop: v.optional(
      v.object({
        state: v.union(
          v.literal("running"),
          v.literal("unknown"),
          v.literal("failed"),
          v.literal("archived_observed"),
        ),
        attempt: v.number(),
        updatedAt: v.number(),
        token: v.optional(v.string()),
        leaseUntil: v.optional(v.number()),
      }),
    ),
    label: v.string(),
  }).index("by_deletionRequestedAt", ["deletionRequestedAt"]),
});
