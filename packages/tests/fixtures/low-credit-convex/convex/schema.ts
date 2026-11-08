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
  fixtureConfig: defineTable({
    enabled: v.boolean(),
    environment: v.string(),
    e2e: v.string(),
    fail: v.boolean(),
  }),
});
