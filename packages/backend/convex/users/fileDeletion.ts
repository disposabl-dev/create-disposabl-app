import { ConvexError, v } from "convex/values";
import { internalMutation } from "@disposabl/disposabl-kit/server/lib/functions";
import { fileDeletionProgress } from "./validator";

/** Delete one bounded page of attributable local files in the same transaction. */
export const runBatch = internalMutation({
  args: { userId: v.id("users"), expectedRequestedAt: v.number() },
  returns: fileDeletionProgress,
  handler: async (ctx, { userId, expectedRequestedAt }) => {
    const user = await ctx.db.get("users", userId);
    if (!user || user.deletionRequestedAt !== expectedRequestedAt)
      throw new ConvexError("Matching deletion request not found.");
    const previous = user.fileDeletion;
    if (previous?.state === "known_convex_cleared") return previous;
    const cursor = previous?.state === "in_progress" ? previous.cursor : null;
    const page = await ctx.db
      .query("files")
      .withIndex("by_owner_provider", (q) =>
        q.eq("owner", userId).eq("location.provider", "convex"),
      )
      .paginate({ cursor, numItems: 20 });
    let deleted = 0,
      missing = 0;
    let shared = cursor ? (previous?.sharedInScan ?? 0) : 0;
    for (const file of page.page) {
      if (file.location.provider !== "convex")
        throw new Error("Unexpected file provider.");
      const storageId = file.location.storageId;
      const refs = await ctx.db
        .query("files")
        .withIndex("by_storageId", (q) => q.eq("location.storageId", storageId))
        .take(2);
      if (refs.some((ref) => ref._id !== file._id)) {
        shared++;
        continue;
      }
      if (await ctx.db.system.get("_storage", storageId)) {
        await ctx.storage.delete(storageId);
        deleted++;
      } else missing++;
      await ctx.db.delete("files", file._id);
    }
    const r2Present = !!(await ctx.db
      .query("files")
      .withIndex("by_owner_provider", (q) =>
        q.eq("owner", userId).eq("location.provider", "r2"),
      )
      .first());
    const progress = {
      state: !page.isDone
        ? ("in_progress" as const)
        : r2Present || shared
          ? ("blocked" as const)
          : ("known_convex_cleared" as const),
      cursor: page.isDone ? null : page.continueCursor,
      batches: (previous?.batches ?? 0) + 1,
      blobsDeleted: (previous?.blobsDeleted ?? 0) + deleted,
      missingBlobs: (previous?.missingBlobs ?? 0) + missing,
      sharedInScan: shared,
      r2Present,
      knownConvexCleared: page.isDone && shared === 0,
      untrackedStorageUnverified: true as const,
      updatedAt: Date.now(),
    };
    await ctx.db.patch("users", userId, { fileDeletion: progress });
    return progress;
  },
});
