import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  users: defineTable({
    deletionRequestedAt: v.optional(v.number()),
    label: v.string(),
  }).index("by_deletionRequestedAt", ["deletionRequestedAt"]),
});
