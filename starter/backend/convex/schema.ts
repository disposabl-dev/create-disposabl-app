import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { profile } from "./users/validator";

export default defineSchema({
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
  }),
  users: defineTable({
    profile: v.optional(profile),
  }),
});
