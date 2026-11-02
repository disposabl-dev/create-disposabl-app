import {
  identityFields,
  internalQuery,
  internalMutation,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { components } from "../_generated/api";

export const current = internalQuery({
  platforms: true,
  args: identityFields,
  returns: v.union(
    v.null(),
    v.object({ id: v.id("users"), username: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx, { userId }) => {
    const id = ctx.db.normalizeId("users", userId);
    if (!id || !(await ctx.db.get("users", id))) return null;
    return {
      id,
      username: await ctx.runQuery(components.authUsername.public.getUsername, {
        userId: id,
      }),
    };
  },
});

/**
 * Create the user row for a new password account and return its id. This
 * example keeps no data in the row, but your app can put a profile here.
 */
export const createUser = internalMutation({
  args: {
    provider: v.object({
      name: v.literal("password"),
      accountId: v.string(),
      profile: v.object({}),
    }),
  },
  returns: v.id("users"),
  handler: async (ctx) => {
    return await ctx.db.insert("users", {});
  },
});
