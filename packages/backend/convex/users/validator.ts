import { v } from "convex/values";

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
