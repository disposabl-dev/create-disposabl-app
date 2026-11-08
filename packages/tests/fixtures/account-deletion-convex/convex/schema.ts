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
    connectionState: v.optional(v.any()),
  }).index("by_deletionRequestedAt", ["deletionRequestedAt"]),
  connections: defineTable({
    userId: v.string(),
    provider: v.string(),
    accountId: v.string(),
    name: v.string(),
    token: v.string(),
    refreshingUntil: v.optional(v.number()),
  }).index("by_userId_provider", ["userId", "provider"]),
  githubConnections: defineTable({
    userId: v.string(),
    owner: v.string(),
    installationId: v.string(),
    organization: v.optional(v.boolean()),
  }).index("by_userId_owner", ["userId", "owner"]),
  files: defineTable({
    owner: v.string(),
    filename: v.string(),
    mediaType: v.string(),
    size: v.number(),
    location: v.any(),
  }).index("by_owner", ["owner"]),
});
