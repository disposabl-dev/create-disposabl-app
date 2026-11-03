import { v } from "convex/values";

export const provider = v.union(
  v.literal("github"),
  v.literal("convex"),
  v.literal("expo"),
  v.literal("blacksmith"),
);
export const oauthProvider = v.union(v.literal("github"), v.literal("convex"));
export const tokenProvider = v.union(v.literal("convex"), v.literal("expo"));
export const account = v.object({ id: v.string(), name: v.string() });
export const installation = v.object({
  installationId: v.string(),
  owner: v.string(),
});
export const completion = v.object({
  installations: v.array(installation),
  proof: v.optional(v.string()),
});
export const connectionStatus = v.object({
  github: v.union(
    v.object({ owner: v.string(), organization: v.boolean() }),
    v.null(),
  ),
  blacksmith: v.union(v.object({ owner: v.string() }), v.null()),
  convex: v.union(v.object({ name: v.string() }), v.null()),
  expo: v.union(v.object({ name: v.string() }), v.null()),
  ready: v.boolean(),
  available: v.object({
    github: v.boolean(),
    convex: v.boolean(),
    expo: v.boolean(),
    blacksmith: v.boolean(),
  }),
  blacksmithInstallUrl: v.string(),
  githubInstallUrl: v.union(v.string(), v.null()),
});
export const storedConnection = v.object({
  accountId: v.string(),
  name: v.string(),
  token: v.string(),
});
