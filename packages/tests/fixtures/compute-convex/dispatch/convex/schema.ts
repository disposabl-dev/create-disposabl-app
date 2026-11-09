import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import product from "@PRODUCT@/schema";
export default defineSchema({
  ...product.tables,
  fixtureOwners: defineTable({
    userId: v.string(),
    outcome: v.union(v.literal("confirmed"), v.literal("unknown")),
  }).index("by_userId", ["userId"]),
  fixtureProviderCalls: defineTable({ userId: v.string() }).index("by_userId", [
    "userId",
  ]),
});
