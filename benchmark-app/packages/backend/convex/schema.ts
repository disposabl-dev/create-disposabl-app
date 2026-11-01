import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({}),
  todos: defineTable({ userId: v.string(), title: v.string() }).index(
    "by_userId",
    ["userId"],
  ),
});
