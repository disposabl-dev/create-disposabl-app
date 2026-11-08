import { ConvexError, v } from "convex/values";
import { internalMutation } from "@disposabl/disposabl-kit/server/lib/functions";
import { authDeletionProgress } from "./validator";

/** Record the unresolved drain prerequisite without changing authentication. */
export const runBatch = internalMutation({
  args: { userId: v.id("users"), expectedRequestedAt: v.number() },
  returns: authDeletionProgress,
  handler: async (ctx, { userId, expectedRequestedAt }) => {
    const user = await ctx.db.get("users", userId);
    if (!user || user.deletionRequestedAt !== expectedRequestedAt)
      throw new ConvexError("Matching deletion request not found.");
    if (user.authDeletion) return user.authDeletion;
    // The existing archived observation does not establish that remote work drained.
    const progress = {
      state: "blocked" as const,
      blocker: "remote_work_drain_unverified" as const,
      updatedAt: Date.now(),
    };
    await ctx.db.patch("users", userId, { authDeletion: progress });
    return progress;
  },
});
