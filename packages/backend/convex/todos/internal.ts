import {
  identityFields,
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import schema from "../schema";

export const create = internalMutation({
  platforms: true,
  args: { ...identityFields, title: v.string() },
  returns: v.id("todos"),
  handler: async (ctx, { userId, title }) => {
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > 500) {
      throw new ConvexError("Todo title must contain 1 to 500 characters.");
    }
    return await ctx.db.insert("todos", { userId, title: trimmed });
  },
});

export const list = internalQuery({
  platforms: true,
  args: { ...identityFields },
  returns: v.array(schema.doc("todos")),
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("todos")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
  },
});

export const get = internalQuery({
  platforms: true,
  args: { ...identityFields, id: v.id("todos") },
  returns: v.union(schema.doc("todos"), v.null()),
  handler: async (ctx, { userId, id }) => {
    const todo = await ctx.db.get("todos", id);
    return todo?.userId === userId ? todo : null;
  },
});
