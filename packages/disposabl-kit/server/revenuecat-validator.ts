import { defineTable } from "convex/server";
import { v } from "convex/values";

export const purchaseEventFields = {
  deliveryId: v.string(),
  project: v.string(),
  app: v.string(),
  environment: v.string(),
  store: v.string(),
  product: v.string(),
  customer: v.string(),
  transaction: v.string(),
  type: v.union(
    v.literal("purchase"),
    v.literal("cancel"),
    v.literal("review"),
  ),
};
export const revenueCatDeliveries = defineTable({
  ...purchaseEventFields,
  balanceId: v.string(),
  conflict: v.boolean(),
})
  .index("by_delivery", ["project", "app", "environment", "deliveryId"])
  .index("by_conflict", ["conflict"]);
export const revenueCatPurchases = defineTable({
  balanceId: v.string(),
  project: v.string(),
  app: v.string(),
  environment: v.string(),
  store: v.string(),
  transaction: v.string(),
  product: v.string(),
  customer: v.string(),
  state: v.union(
    v.literal("queued"),
    v.literal("grant_unknown"),
    v.literal("granted"),
    v.literal("tombstone"),
    v.literal("refund_review"),
    v.literal("refund_queued"),
    v.literal("refund_unknown"),
    v.literal("refunded"),
    v.literal("review"),
  ),
  refundPending: v.boolean(),
  reviewPending: v.boolean(),
  refundEvidence: v.optional(v.string()),
  reconciliationEvidence: v.optional(v.string()),
})
  .index("by_balanceId", ["balanceId"])
  .index("by_state", ["state"]);
export const revenueCatTransfers = defineTable({
  project: v.string(),
  app: v.string(),
  environment: v.string(),
  deliveryId: v.string(),
  from: v.array(v.string()),
  to: v.array(v.string()),
}).index("by_delivery", ["project", "app", "environment", "deliveryId"]);
export const revenueCatTransferHolds = defineTable({
  project: v.string(),
  app: v.string(),
  environment: v.string(),
  customer: v.string(),
  deliveryId: v.string(),
  active: v.boolean(),
})
  .index("by_customer_active", ["project", "environment", "customer", "active"])
  .index("by_delivery_customer", [
    "project",
    "app",
    "environment",
    "deliveryId",
    "customer",
  ]);
