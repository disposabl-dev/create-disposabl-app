import {
  organizationFields,
  memberFields,
  tokenFields,
} from "./mcpEnterprise/validator";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { pendingDelete } from "./apps/validator";
import { deployment, platform, releases } from "./validator";

export default defineSchema({
  mcpOrganizations: defineTable(organizationFields)
    .index("by_tenantId", ["tenantId"])
    .index("by_issuer", ["issuer"]),
  mcpMembers: defineTable(memberFields)
    .index("by_organizationId_userId", ["organizationId", "userId"])
    .index("by_organizationId_verifiedEmail", [
      "organizationId",
      "verifiedEmail",
    ])
    .index("by_organizationId_subject", ["organizationId", "subject"]),
  mcpEnterpriseTokens: defineTable(tokenFields)
    .index("by_hash", ["hash"])
    .index("by_organizationId_jti", ["organizationId", "jti"]),
  serviceIdentities: defineTable({
    key: v.string(),
    token: v.optional(v.string()),
    expiresAt: v.number(),
    refreshAfter: v.number(),
    lease: v.optional(v.string()),
  }).index("by_key", ["key"]),
  users: defineTable({
    // Legacy confirmation data is retained for schema compatibility, never required.
    blacksmith: v.optional(
      v.object({
        owner: v.string(),
        installationId: v.string(),
        confirmedAt: v.number(),
      }),
    ),
    connectionState: v.optional(
      v.object({
        provider: v.union(v.literal("github"), v.literal("convex")),
        hash: v.string(),
        verifier: v.string(),
        expiresAt: v.number(),
      }),
    ),
  }),
  connections: defineTable({
    userId: v.string(),
    provider: v.union(v.literal("convex"), v.literal("expo")),
    accountId: v.string(),
    name: v.string(),
    token: v.string(),
  }).index("by_userId_provider", ["userId", "provider"]),
  apps: defineTable({
    appId: v.string(),
    userId: v.string(),
    name: v.string(),
    platforms: v.array(platform),
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
    .index("by_userId", ["userId"]),
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
