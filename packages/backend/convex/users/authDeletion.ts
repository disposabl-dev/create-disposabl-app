import { ConvexError, v } from "convex/values";
import { internalMutation } from "@disposabl/disposabl-kit/server/lib/functions";
import { components } from "../_generated/api";
import { authDeletionProgress } from "./validator";

/** One operator call atomically fences both components and advances bounded cleanup. */
export const runBatch = internalMutation({
  args: { userId: v.id("users"), expectedRequestedAt: v.number() },
  returns: authDeletionProgress,
  handler: async (ctx, { userId, expectedRequestedAt }) => {
    const user = await ctx.db.get("users", userId);
    if (!user || user.deletionRequestedAt !== expectedRequestedAt)
      throw new ConvexError("Matching deletion request not found.");
    const previous = user.authDeletion;
    if (previous?.state === "linked_auth_cleared") return previous;
    await ctx.runMutation(components.auth.public.beginUserErasure, { userId });
    const passwords = await ctx.runMutation(
      components.authPassword.public.eraseUserPasswords,
      { userId },
    );
    const core = await ctx.runMutation(
      components.auth.public.purgeUserLinkedAuth,
      { userId },
    );
    const progress = {
      state:
        passwords.complete && core.linkedRowsCleared
          ? ("linked_auth_cleared" as const)
          : ("in_progress" as const),
      batches: (previous?.batches ?? 0) + 1,
      passwordsDeleted: (previous?.passwordsDeleted ?? 0) + passwords.deleted,
      accountsDeleted: (previous?.accountsDeleted ?? 0) + core.deletedAccounts,
      sessionsDeleted: (previous?.sessionsDeleted ?? 0) + core.deletedSessions,
      refreshTokensDeleted:
        (previous?.refreshTokensDeleted ?? 0) + core.deletedRefreshTokens,
      passwordsCleared: passwords.complete,
      linkedRowsCleared: core.linkedRowsCleared,
      legacyOrphansUnverified: true as const,
      updatedAt: Date.now(),
    };
    await ctx.db.patch("users", userId, { authDeletion: progress });
    return progress;
  },
});
