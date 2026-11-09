import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  revenueCatDeliveries,
  revenueCatPurchases,
  revenueCatTransfers,
  revenueCatTransferHolds,
} from "../../../../disposabl-kit/server/revenuecat-validator";
export default defineSchema({
  users: defineTable({ label: v.string() }),
  workerControls: defineTable({
    balanceId: v.string(),
    enabled: v.boolean(),
    released: v.boolean(),
    arrived: v.number(),
    finished: v.number(),
    providerCalls: v.number(),
    claimAttempts: v.number(),
    providerCustomer: v.optional(v.string()),
  }).index("by_balanceId", ["balanceId"]),
  revenueCatDeliveries: revenueCatDeliveries.index("by_balanceId", [
    "balanceId",
  ]),
  revenueCatPurchases,
  revenueCatTransfers,
  revenueCatTransferHolds,
});
