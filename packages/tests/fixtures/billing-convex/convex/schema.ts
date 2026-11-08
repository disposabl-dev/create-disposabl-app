import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  billingAttempts: defineTable({
    userId: v.string(),
    purchase: v.string(),
    requestId: v.string(),
    url: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    resolution: v.optional(
      v.object({ outcome: v.string(), evidence: v.string() }),
    ),
  })
    .index("by_userId_purchase_resolvedAt_url", [
      "userId",
      "purchase",
      "resolvedAt",
      "url",
    ])
    .index("by_userId_requestId", ["userId", "requestId"]),
});
