import {
  revenueCatDeliveries,
  revenueCatPurchases,
  revenueCatTransfers,
  revenueCatTransferHolds,
} from "@disposabl/disposabl-kit/server/revenuecat-validator";
import { desktopUpdateTable } from "./desktopUpdates/validator";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  authDeletionProgress,
  fileDeletionProgress,
  ephemeralDeletionProgress,
  mcpDeletionProgress,
  profile,
} from "./users/validator";
import { eventFields, execution } from "./agent/validator";
import {
  computeSessionFields,
  computeDebitFields,
} from "./agent/computeValidator";
import { pendingDelete } from "./apps/validator";
import {
  deployment,
  platform,
  feature,
  releases,
  androidArchitecture,
} from "./validator";
import {
  connectionState,
  tokenProvider,
  posthogProject,
} from "./connections/validator";

export default defineSchema({
  deletionReceipts: defineTable({
    reference: v.string(),
    ownerId: v.string(),
    requestedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_reference", ["reference"]),
  telemetryIssuance: defineTable({
    key: v.literal("global"),
    tokens: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  telemetryIdentities: defineTable({
    hash: v.string(),
    userId: v.optional(v.string()),
    expiresAt: v.number(),
    link: v.optional(
      v.object({
        anonymous: v.string(),
        distinct: v.string(),
        eventId: v.string(),
        createdAt: v.number(),
        attempts: v.number(),
      }),
    ),
  })
    .index("by_hash", ["hash"])
    .index("by_userId", ["userId"]),
  computeSessions: defineTable(computeSessionFields).index("by_userId", [
    "userId",
  ]),
  computeDebits: defineTable(computeDebitFields).index("by_sessionId", [
    "sessionId",
  ]),
  billingHandoffs: defineTable({
    hash: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    purchase: v.optional(v.union(v.literal("monthly"), v.literal("topup"))),
    returnChannel: v.optional(v.string()),
    browserSessionId: v.optional(v.string()),
    returnExpiresAt: v.optional(v.number()),
    expiresAt: v.number(),
  })
    .index("by_hash", ["hash"])
    .index("by_userId", ["userId"]),
  billingAttempts: defineTable({
    userId: v.string(),
    purchase: v.string(),
    requestId: v.string(),
    url: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    resolution: v.optional(
      v.object({ outcome: v.string(), evidence: v.string() }),
    ),
  })
    .index("by_userId_purchase_resolvedAt_url", [
      "userId",
      "purchase",
      "resolvedAt",
      "url",
    ])
    .index("by_userId_requestId", ["userId", "requestId"]),
  revenueCatDeliveries,
  revenueCatTransfers,
  revenueCatTransferHolds,
  revenueCatPurchases,
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
  })
    .index("by_owner_provider", ["owner", "location.provider"])
    .index("by_storageId", ["location.storageId"]),
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
    deletionRequestedAt: v.optional(v.number()),
    mcpDeletion: v.optional(mcpDeletionProgress),
    authDeletion: v.optional(authDeletionProgress),
    fileDeletion: v.optional(fileDeletionProgress),
    ephemeralDeletion: v.optional(ephemeralDeletionProgress),
    deletionStop: v.optional(
      v.object({
        state: v.union(
          v.literal("running"),
          v.literal("unknown"),
          v.literal("failed"),
          v.literal("archived_observed"),
        ),
        attempt: v.number(),
        updatedAt: v.number(),
        token: v.optional(v.string()),
        leaseUntil: v.optional(v.number()),
      }),
    ),
    profile: v.optional(profile),
    connectionState: v.optional(connectionState),
    browserHandoff: v.optional(
      v.object({
        hash: v.string(),
        sessionId: v.string(),
        expiresAt: v.number(),
      }),
    ),
  })
    .index("by_browserHandoffHash", ["browserHandoff.hash"])
    .index("by_deletionRequestedAt", ["deletionRequestedAt"]),
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
    androidArchitectures: v.optional(v.array(androidArchitecture)),
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
        androidArchitectures: v.optional(v.array(androidArchitecture)),
        pending: v.optional(pendingDelete),
        expoManual: v.optional(v.boolean()),
      }),
    ),
  })
    .index("by_appId", ["appId"])
    // App lists use creation order; conversation lists use last activity.
    // eslint-disable-next-line @convex-dev/no-duplicate-indexes
    .index("by_userId", ["userId"])
    .index("by_computeSessionId_status", [
      "agent.computeSessionId",
      "agent.status",
    ])
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
