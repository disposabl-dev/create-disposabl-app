import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { query } from "../_generated/server";
import schema from "../schema";

export const list = query({
  args: {},
  returns: v.array(schema.doc("todos")),
  handler: async (ctx): Promise<Doc<"todos">[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not signed in");
    return await ctx.runQuery(internal.todos.internal.list, { userId });
  },
});

export const get = query({
  args: { id: v.id("todos") },
  returns: v.union(schema.doc("todos"), v.null()),
  handler: async (ctx, { id }): Promise<Doc<"todos"> | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not signed in");
    return await ctx.runQuery(internal.todos.internal.get, { userId, id });
  },
});
