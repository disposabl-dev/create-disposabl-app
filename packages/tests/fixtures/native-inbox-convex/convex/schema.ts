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
  revenueCatDeliveries: revenueCatDeliveries.index("by_balanceId", [
    "balanceId",
  ]),
  revenueCatPurchases,
  revenueCatTransfers,
  revenueCatTransferHolds,
});
