import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import product from "@PRODUCT@/schema";
export default defineSchema({
  ...product.tables,
  fixtureOwners: defineTable({
    userId: v.string(),
    outcome: v.union(
      v.literal("confirmed"),
      v.literal("denied"),
      v.literal("unknown"),
      v.literal("deferred"),
    ),
    responseBalance: v.number(),
  }).index("by_userId", ["userId"]),
  fixtureNoticeCalls: defineTable({ debitId: v.id("computeDebits") }).index(
    "by_debitId",
    ["debitId"],
  ),
  fixtureProviderCalls: defineTable({ userId: v.string() }).index("by_userId", [
    "userId",
  ]),
});
