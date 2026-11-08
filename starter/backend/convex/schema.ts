import {
  revenueCatDeliveries,
  revenueCatPurchases,
  revenueCatTransfers,
  revenueCatTransferHolds,
} from "@disposabl/disposabl-kit/server/revenuecat-validator";
import { desktopUpdateTable } from "./desktopUpdates/validator";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { profile } from "./users/validator";

export default defineSchema({
  billingHandoffs: defineTable({
    hash: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    expiresAt: v.number(),
  }).index("by_hash", ["hash"]),
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
  }),
  users: defineTable({
    profile: v.optional(profile),
  }),
});
