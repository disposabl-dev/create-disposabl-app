import {
  identityFields,
  internalMutation,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";

/** A trusted installation callback supplies this verified binding, never a client API. */
export const connect = internalMutation({
  args: {
    ...identityFields,
    owner: v.string(),
    installationId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, owner, installationId }) => {
    if (!/^[a-zA-Z0-9-]+$/.test(owner) || !/^\d+$/.test(installationId))
      throw new ConvexError("Invalid GitHub installation.");
    owner = owner.toLowerCase();
    const existing = await ctx.db
      .query("githubConnections")
      .withIndex("by_userId_owner", (q) =>
        q.eq("userId", userId).eq("owner", owner),
      )
      .unique();
    if (existing) await ctx.db.delete("githubConnections", existing._id);
    await ctx.db.insert("githubConnections", {
      userId,
      owner,
      installationId,
    });
    return null;
  },
});
