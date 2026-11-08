import { v } from "convex/values";

export const mcpDeletionProgress = v.object({
  state: v.union(v.literal("in_progress"), v.literal("attributed_complete")),
  batches: v.number(),
  requestsDeleted: v.number(),
  tokensDeleted: v.number(),
  grantsDeleted: v.number(),
  updatedAt: v.number(),
});

export const profile = v.object({
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  picture: v.optional(v.string()),
});

export const account = v.object({
  username: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  profile: v.union(profile, v.null()),
  passwordMethod: v.union(v.literal("username"), v.literal("email"), v.null()),
});
