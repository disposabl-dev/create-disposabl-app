import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const platformNames = [
  "web",
  "android",
  "ios",
  "macos",
  "windows",
  "linux",
  "api",
  "mcp",
  "typescript-sdk",
  "cli",
] as const;
export const platform = v.union(
  ...platformNames.map((name) => v.literal(name)),
);
export const githubConnection = v.object({
  owner: v.string(),
  installationId: v.string(),
});
export const github = v.object({
  repositoryId: v.number(),
  owner: v.string(),
  repo: v.string(),
  installationId: v.string(),
});
export const appFields = {
  appId: v.string(),
  name: v.string(),
  platforms: v.array(platform),
};
export const appIdentity = { appId: v.string() };
export const appArgs = {
  name: v.string(),
  platforms: v.array(platform),
  appId: v.optional(v.string()),
};
export const appResult = v.object({
  ...appFields,
  github: v.optional(github),
  createdAt: v.number(),
});
export const previewIdentity = { ...appIdentity, reference: v.string() };
export const deployment = v.object({
  name: v.string(),
  reference: v.string(),
  convexUrl: v.string(),
  convexSiteUrl: v.string(),
});
export const run = v.object({
  id: v.number(),
  attempt: v.number(),
  number: v.number(),
  commitSha: v.string(),
  url: v.string(),
});
export const releaseDetails = {
  status: v.union(
    v.literal("building"),
    v.literal("ready"),
    v.literal("failed"),
    v.literal("blocked"),
  ),
  reason: v.optional(v.string()),
  version: v.optional(v.string()),
  url: v.optional(v.string()),
  githubReleaseUrl: v.optional(v.string()),
  artifactUrl: v.optional(v.string()),
  updateUrl: v.optional(v.string()),
};
export const release = v.object({ ...releaseDetails, run });
const releases = v.record(v.string(), release);
const platformStates = v.record(
  v.string(),
  v.object({
    enabled: v.boolean(),
    url: v.optional(v.string()),
    latest: v.optional(release.omit("url")),
  }),
);
export const previewFields = v.object({
  ...previewIdentity,
  stage: v.union(v.literal("generating"), v.literal("building")),
  deployment: v.optional(deployment),
  releases,
  updatedAt: v.number(),
});
export const releaseFields = v.object({
  ...appIdentity,
  releases,
  updatedAt: v.number(),
});
export const previewResult = previewFields
  .omit("releases")
  .extend({ platforms: platformStates });
export const releasesResult = releaseFields
  .omit("releases")
  .extend({ platforms: platformStates });

export default defineSchema({
  users: defineTable({ github: v.optional(githubConnection) }),
  apps: defineTable({
    ...appFields,
    userId: v.string(),
    github: v.optional(github),
    convexProjectId: v.optional(v.number()),
    provisioning: v.optional(
      v.object({ id: v.string(), expiresAt: v.number() }),
    ),
    deletedAt: v.optional(v.number()),
  })
    .index("by_appId", ["appId"])
    .index("by_userId_deletedAt", ["userId", "deletedAt"]),
  previews: defineTable(previewFields).index("by_appId_reference", [
    "appId",
    "reference",
  ]),
  appReleases: defineTable(releaseFields).index("by_appId", ["appId"]),
});
