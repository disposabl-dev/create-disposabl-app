import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { fileDeletionProgress } from "../../../../backend/convex/users/validator";
export default defineSchema({
  users: defineTable({
    deletionRequestedAt: v.optional(v.number()),
    fileDeletion: v.optional(fileDeletionProgress),
  }).index("by_deletionRequestedAt", ["deletionRequestedAt"]),
  files: defineTable({
    owner: v.string(),
    filename: v.string(),
    mediaType: v.string(),
    size: v.number(),
    location: v.union(
      v.object({ provider: v.literal("convex"), storageId: v.id("_storage") }),
      v.object({
        provider: v.literal("r2"),
        key: v.string(),
        account: v.string(),
        bucket: v.string(),
      }),
    ),
  })
    .index("by_owner_provider", ["owner", "location.provider"])
    .index("by_storageId", ["location.storageId"]),
});
