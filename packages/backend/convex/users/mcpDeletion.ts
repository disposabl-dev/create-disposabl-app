import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import { internalMutation } from "@disposabl/disposabl-kit/server/lib/functions";
import { mcpDeletionProgress } from "./validator";

/** One explicit operator call advances one component batch. */
export const runBatch = internalMutation({
  args: { userId: v.id("users"), expectedRequestedAt: v.number() },
  returns: mcpDeletionProgress,
  handler: async (ctx, { userId, expectedRequestedAt }) => {
    const user = await ctx.db.get("users", userId);
    if (
      !user ||
      user.deletionRequestedAt === undefined ||
      user.deletionRequestedAt !== expectedRequestedAt
    )
      throw new ConvexError("Matching deletion request not found.");
    const previous = user.mcpDeletion;
    if (previous?.state === "attributed_complete") return previous;
    const result = await ctx.runMutation(
      components.mcp.erasure.eraseUserBatch,
      { userId },
    );
    const progress = {
      state: result.doneAttributed
        ? ("attributed_complete" as const)
        : ("in_progress" as const),
      batches: (previous?.batches ?? 0) + 1,
      requestsDeleted:
        (previous?.requestsDeleted ?? 0) + result.requestsDeleted,
      tokensDeleted: (previous?.tokensDeleted ?? 0) + result.tokensDeleted,
      grantsDeleted: (previous?.grantsDeleted ?? 0) + result.grantsDeleted,
      updatedAt: Date.now(),
    };
    await ctx.db.patch("users", userId, { mcpDeletion: progress });
    return progress;
  },
});
