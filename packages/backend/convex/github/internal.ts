import { internalMutation } from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";

/** A trusted installation callback supplies this verified binding, never a client API. */
export const connect = internalMutation({
  args: {
    userId: v.id("users"),
    owner: v.string(),
    installationId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, owner, installationId }) => {
    if (!(await ctx.db.get("users", userId)))
      throw new ConvexError("User not found.");
    if (!/^[a-zA-Z0-9-]+$/.test(owner) || !/^\d+$/.test(installationId))
      throw new ConvexError("Invalid GitHub installation.");
    owner = owner.toLowerCase();
    const existing = await ctx.db
      .query("githubConnections")
      .withIndex("by_userId_owner", (q) =>
        q.eq("userId", userId).eq("owner", owner),
      )
      .unique();
    if (existing)
      await ctx.db.patch("githubConnections", existing._id, { installationId });
    else
      await ctx.db.insert("githubConnections", {
        userId,
        owner,
        installationId,
      });
    return null;
  },
});
