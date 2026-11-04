import { v } from "convex/values";

export const provider = v.union(
  v.literal("github"),
  v.literal("convex"),
  v.literal("expo"),
  v.literal("posthog"),
);
export const oauthProvider = v.union(
  v.literal("github"),
  v.literal("convex"),
  v.literal("posthog"),
);
export const tokenProvider = v.union(
  v.literal("convex"),
  v.literal("expo"),
  v.literal("posthog"),
);
export const posthogRegion = v.union(v.literal("us"), v.literal("eu"));
export const posthogProject = v.object({
  projectId: v.number(),
  organizationId: v.string(),
  region: posthogRegion,
  projectToken: v.string(),
});
export const analyticsConfig = v.object({
  projectId: v.number(),
  projectToken: v.string(),
  host: v.string(),
});
export const connectionState = v.object({
  provider: oauthProvider,
  hash: v.string(),
  verifier: v.string(),
  region: v.optional(posthogRegion),
  expiresAt: v.number(),
});
export const account = v.object({ id: v.string(), name: v.string() });
export const installation = v.object({
  installationId: v.string(),
  owner: v.string(),
  organization: v.boolean(),
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
  convex: v.union(v.object({ name: v.string() }), v.null()),
  expo: v.union(v.object({ name: v.string() }), v.null()),
  posthog: v.union(v.object({ name: v.string() }), v.null()),
  posthogPending: v.boolean(),
  ready: v.boolean(),
  missing: v.array(provider),
  connectionsUrl: v.string(),
  available: v.object({
    github: v.boolean(),
    convex: v.boolean(),
    expo: v.boolean(),
    posthog: v.boolean(),
  }),
  githubInstallUrl: v.union(v.string(), v.null()),
});
export const storedConnection = v.object({
  accountId: v.string(),
  name: v.string(),
  token: v.string(),
});
