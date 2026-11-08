import { v } from "convex/values";
import { featureIds } from "@disposabl/disposabl-kit/feature-options";

export const feature = v.union(...featureIds.map((id) => v.literal(id)));

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
export const androidArchitecture = v.union(
  v.literal("arm64-v8a"),
  v.literal("x86_64"),
  v.literal("armeabi-v7a"),
  v.literal("x86"),
);
export const githubConnection = v.object({
  owner: v.string(),
  installationId: v.string(),
});
export const appFields = {
  appId: v.string(),
  name: v.string(),
  platforms: v.array(platform),
  features: v.optional(v.array(feature)),
  androidArchitectures: v.optional(v.array(androidArchitecture)),
};
export const appArgs = {
  name: v.string(),
  platforms: v.array(platform),
  features: v.optional(v.array(feature)),
  androidArchitectures: v.optional(v.array(androidArchitecture)),
};
export const appResult = v.object({
  ...appFields,
  githubOwner: v.optional(v.string()),
  githubRepo: v.optional(v.string()),
  createdAt: v.number(),
});
export const requestedConfiguration = {
  platforms: v.optional(v.array(platform)),
  features: v.optional(v.array(feature)),
  androidArchitectures: v.optional(v.array(androidArchitecture)),
};
export const previewIdentity = { appId: v.string(), reference: v.string() };
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
export const release = v.object({
  ...releaseDetails,
  artifactId: v.optional(v.number()),
  run,
});
export const releases = v.record(v.string(), release);
const platformStates = v.record(
  v.string(),
  v.object({
    enabled: v.boolean(),
    url: v.optional(v.string()),
    latest: v.optional(release.omit("url", "artifactId")),
  }),
);
export const previewResult = v.object({
  appId: v.string(),
  reference: v.string(),
  stage: v.union(v.literal("generating"), v.literal("building")),
  deployment: v.optional(deployment),
  platforms: platformStates,
  updatedAt: v.number(),
});
export const releasesResult = v.object({
  appId: v.string(),
  platforms: platformStates,
  updatedAt: v.number(),
});
