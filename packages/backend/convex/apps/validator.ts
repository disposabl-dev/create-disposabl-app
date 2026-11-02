import { v } from "convex/values";

export const deleteArgs = {
  appId: v.string(),
  dangerouslyDeleteApp: v.literal(true),
};
export const resources = v.object({
  githubOwner: v.optional(v.string()),
  githubRepo: v.optional(v.string()),
  convexProjectId: v.optional(v.number()),
  expoProjectId: v.optional(v.string()),
  expoAccountId: v.optional(v.union(v.string(), v.null())),
});

export const pendingDelete = v.object({
  provider: v.union(
    v.literal("github"),
    v.literal("convex"),
    v.literal("expo"),
  ),
  accountId: v.string(),
  receipt: v.optional(v.string()),
});
