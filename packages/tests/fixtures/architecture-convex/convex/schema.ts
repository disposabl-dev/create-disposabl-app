import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  apps: defineTable({
    appId: v.string(),
    userId: v.string(),
    name: v.string(),
    platforms: v.array(v.string()),
    features: v.array(v.string()),
    androidArchitectures: v.array(v.string()),
    operation: v.optional(
      v.object({
        kind: v.literal("setup"),
        until: v.number(),
        androidArchitectures: v.optional(v.array(v.string())),
      }),
    ),
  }).index("by_appId", ["appId"]),
});
