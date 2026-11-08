import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import product from "@PRODUCT@/schema";
export default defineSchema({
  ...product.tables,
  fixtureProviderCalls: defineTable({ userId: v.string() }).index("by_userId", [
    "userId",
  ]),
});
