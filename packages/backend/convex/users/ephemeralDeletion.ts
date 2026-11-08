import { ConvexError, v } from "convex/values";
import { internalMutation } from "@disposabl/disposabl-kit/server/lib/functions";
import { ephemeralDeletionProgress } from "./validator";

// Completion depends on the deletion fence on telemetry identity writes.
export const runBatch = internalMutation({
  args: { userId: v.id("users"), expectedRequestedAt: v.number() },
  returns: ephemeralDeletionProgress,
  handler: async (ctx, { userId, expectedRequestedAt }) => {
    const user = await ctx.db.get("users", userId);
    if (
      !user ||
      user.deletionRequestedAt === undefined ||
      user.deletionRequestedAt !== expectedRequestedAt
    )
      throw new ConvexError("Matching deletion request not found.");
    const previous =
      user.ephemeralDeletion?.requestedAt === expectedRequestedAt
        ? user.ephemeralDeletion
        : undefined;
    if (previous?.state === "known_user_bound_cleared") return previous;
    const handoffs = await ctx.db
      .query("billingHandoffs")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(100);
    const identities = await ctx.db
      .query("telemetryIdentities")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(100);
    for (const row of handoffs) await ctx.db.delete("billingHandoffs", row._id);
    for (const row of identities)
      await ctx.db.delete("telemetryIdentities", row._id);
    const progress = {
      requestedAt: expectedRequestedAt,
      state:
        handoffs.length < 100 && identities.length < 100
          ? ("known_user_bound_cleared" as const)
          : ("in_progress" as const),
      batches: (previous?.batches ?? 0) + 1,
      billingHandoffsDeleted:
        (previous?.billingHandoffsDeleted ?? 0) + handoffs.length,
      telemetryIdentitiesDeleted:
        (previous?.telemetryIdentitiesDeleted ?? 0) + identities.length,
      updatedAt: Date.now(),
    };
    await ctx.db.patch("users", userId, { ephemeralDeletion: progress });
    return progress;
  },
});
