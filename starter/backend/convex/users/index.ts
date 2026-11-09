import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ id: v.id("users"), username: v.union(v.string(), v.null()) }),
  ),
  handler: async (
    ctx,
  ): Promise<{ id: Id<"users">; username: string | null } | null> => {
    const userId = await getAuthUserId(ctx);
    return userId === null
      ? null
      : ctx.runQuery(internal.users.internal.current, { userId });
  },
});
