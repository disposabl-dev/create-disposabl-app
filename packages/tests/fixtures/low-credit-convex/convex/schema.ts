import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import appSchema from "../../../../backend/convex/schema";
export default defineSchema({
  ...appSchema.tables,
  fixtureEmails: defineTable({
    key: v.string(),
    to: v.string(),
    text: v.string(),
  }).index("by_key", ["key"]),
  fixtureReads: defineTable({
    debitId: v.id("computeDebits"),
    method: v.string(),
    nonConsuming: v.boolean(),
  }).index("by_debit", ["debitId"]),
});
