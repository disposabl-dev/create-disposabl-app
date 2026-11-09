import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  users: defineTable({ label: v.string() }),
  messages: defineTable({
    to: v.string(),
    text: v.string(),
    subject: v.string(),
  }).index("by_to", ["to"]),
});
