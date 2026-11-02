import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { appFields } from "./apps/model";
import { previewFields } from "./previews/model";

export default defineSchema({
  users: defineTable({}),
  apps: defineTable({
    ...appFields,
    userId: v.string(),
    convexProjectId: v.optional(v.number()),
    provisioningUntil: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_appId", ["appId"])
    .index("by_userId_deletedAt", ["userId", "deletedAt"]),
  previews: defineTable(previewFields).index("by_appId_reference", [
    "appId",
    "reference",
  ]),
});
