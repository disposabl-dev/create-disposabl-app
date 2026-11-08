import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { mcpDeletionProgress } from "../../../../backend/convex/users/validator";
export default defineSchema({
  users: defineTable({
    deletionRequestedAt: v.optional(v.number()),
    mcpDeletion: v.optional(mcpDeletionProgress),
    label: v.string(),
  }).index("by_deletionRequestedAt", ["deletionRequestedAt"]),
});
