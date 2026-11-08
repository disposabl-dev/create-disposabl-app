import { getSessionUserId } from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { platform } from "../validator";

export const installer = action({
  args: { appId: v.string(), platform, reference: v.optional(v.string()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const userId = await getSessionUserId(ctx);
    if (!userId) throw new ConvexError("Sign in to download your app.");
    try {
      const url: string | null = await ctx.runAction(
        internal.downloads.action.resolve,
        { ...args, userId },
      );
      if (url) return url;
    } catch {
      // Upstream credentials and repository details must not reach the client.
    }
    return null;
  },
});
