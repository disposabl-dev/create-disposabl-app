import { getActiveSessionUserId as getSessionUserId } from "../users/deletion";
import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import { query } from "../_generated/server";
import { releasesResult } from "../validator";

export const get = query({
  args: { appId: v.string() },
  returns: v.union(releasesResult, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof releasesResult> | null> => {
    const userId = await getSessionUserId(ctx);
    if (!userId) return null;
    return ctx.runQuery(internal.releases.internal.get, { ...args, userId });
  },
});
