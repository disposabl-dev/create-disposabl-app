import { desktopUpdateTable } from "./desktopUpdates/validator";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { profile } from "./users/validator";
import { eventFields, execution } from "./agent/validator";
import { pendingDelete } from "./apps/validator";
import { deployment, platform, feature, releases } from "./validator";
import {
  connectionState,
  tokenProvider,
  posthogProject,
} from "./connections/validator";

export default defineSchema({
  desktopUpdates: desktopUpdateTable,
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
  agentEvents: defineTable(eventFields)
    .index("by_messageId", ["messageId"])
    .index("by_threadId_taskId", ["threadId", "taskId"])
    .index("by_threadId_eventId", ["threadId", "eventId"])
    .index("by_threadId_streaming", ["threadId", "streaming"]),
  serviceIdentities: defineTable({
    key: v.string(),
    token: v.optional(v.string()),
    expiresAt: v.number(),
    refreshAfter: v.number(),
    lease: v.optional(v.string()),
  }).index("by_key", ["key"]),
  users: defineTable({
    profile: v.optional(profile),
    connectionState: v.optional(connectionState),
    browserHandoff: v.optional(
      v.object({
        hash: v.string(),
        sessionId: v.string(),
        expiresAt: v.number(),
      }),
    ),
  }).index("by_browserHandoffHash", ["browserHandoff.hash"]),
  connections: defineTable({
    userId: v.string(),
    provider: tokenProvider,
    accountId: v.string(),
    name: v.string(),
    token: v.string(),
    refreshingUntil: v.optional(v.number()),
  }).index("by_userId_provider", ["userId", "provider"]),
  apps: defineTable({
    appId: v.string(),
    userId: v.string(),
    name: v.string(),
    platforms: v.array(platform),
    features: v.optional(v.array(feature)),
    agent: v.optional(execution),
    posthogProject: v.optional(posthogProject),
    githubOwner: v.optional(v.string()),
    githubRepo: v.optional(v.string()),
    convexProjectId: v.optional(v.number()),
    expoProjectId: v.optional(v.string()),
    expoAccountId: v.optional(v.union(v.string(), v.null())),
    operation: v.optional(
      v.object({
        kind: v.union(v.literal("setup"), v.literal("delete")),
        until: v.number(),
        pending: v.optional(pendingDelete),
        expoManual: v.optional(v.boolean()),
      }),
    ),
  })
    .index("by_appId", ["appId"])
    // App lists use creation order; conversation lists use last activity.
    // eslint-disable-next-line @convex-dev/no-duplicate-indexes
    .index("by_userId", ["userId"])
    .index("by_threadId", ["agent.threadId"])
    .index("by_agentAccessHash", ["agent.access.hash"])
    .index("by_userId_agentUpdatedAt", ["userId", "agent.updatedAt"]),
  previews: defineTable({
    appId: v.string(),
    reference: v.string(),
    stage: v.union(v.literal("generating"), v.literal("building")),
    deployment: v.optional(deployment),
    releases,
    updatedAt: v.number(),
  }).index("by_appId_reference", ["appId", "reference"]),
  appReleases: defineTable({
    appId: v.string(),
    releases,
    updatedAt: v.number(),
  }).index("by_appId", ["appId"]),
  githubConnections: defineTable({
    userId: v.string(),
    owner: v.string(),
    installationId: v.string(),
    organization: v.optional(v.boolean()),
  })
    // Latest connection uses creation order; owner lookup uses the compound index.
    // eslint-disable-next-line @convex-dev/no-duplicate-indexes
    .index("by_userId", ["userId"])
    .index("by_userId_owner", ["userId", "owner"]),
});
