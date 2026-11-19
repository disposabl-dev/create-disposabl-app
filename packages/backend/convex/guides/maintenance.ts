import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { changeStats, removeComment, resolveReports } from "./model";

export const moderationQueue = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      commentId: v.id("guideComments"),
      lessonId: v.string(),
      body: v.string(),
      hidden: v.boolean(),
      reports: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const reports = await ctx.db
      .query("guideReports")
      .withIndex("by_resolved", (q) => q.eq("resolved", false))
      .take(60);
    const comments = await Promise.all(
      [...new Set(reports.map(({ commentId }) => commentId))].map((commentId) =>
        ctx.db.get("guideComments", commentId),
      ),
    );
    return comments.flatMap((comment) =>
      comment
        ? [
            {
              commentId: comment._id,
              lessonId: comment.lessonId,
              body: comment.body,
              hidden: comment.hidden,
              reports: comment.reports,
            },
          ]
        : [],
    );
  },
});

export const resolve = internalMutation({
  args: {
    commentId: v.id("guideComments"),
    decision: v.union(
      v.literal("approve"),
      v.literal("remove"),
      v.literal("ban"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { commentId, decision }) => {
    const comment = await ctx.db.get("guideComments", commentId);
    if (comment) {
      if (decision === "approve") {
        await ctx.db.patch("guideComments", commentId, {
          hidden: false,
          reports: 0,
        });
        if (comment.hidden)
          await changeStats(ctx, comment.lessonId, "comments", 1);
        await resolveReports(ctx, commentId);
      } else {
        await removeComment(ctx, comment);
        if (decision === "ban" && (await ctx.db.get("users", comment.userId))) {
          await ctx.db.patch("users", comment.userId, {
            guideCommentsBanned: true,
          });
        }
      }
    }
    return null;
  },
});

export async function clearGuideData(ctx: MutationCtx, userId: Id<"users">) {
  const limit = 100;
  const [likes, comments, reported, reports, blocks, blockedBy] =
    await Promise.all([
      ctx.db
        .query("guideLikes")
        .withIndex("by_userId_lessonId", (q) => q.eq("userId", userId))
        .take(limit),
      ctx.db
        .query("guideComments")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(limit),
      ctx.db
        .query("guideReports")
        .withIndex("by_authorId", (q) => q.eq("authorId", userId))
        .take(limit),
      ctx.db
        .query("guideReports")
        .withIndex("by_userId_commentId", (q) => q.eq("userId", userId))
        .take(limit),
      ctx.db
        .query("guideBlocks")
        .withIndex("by_userId_blockedId", (q) => q.eq("userId", userId))
        .take(limit),
      ctx.db
        .query("guideBlocks")
        .withIndex("by_blockedId", (q) => q.eq("blockedId", userId))
        .take(limit),
    ]);
  for (const like of likes) {
    await ctx.db.delete("guideLikes", like._id);
    await changeStats(ctx, like.lessonId, "likes", -1);
  }
  for (const comment of comments) await removeComment(ctx, comment);
  for (const row of [...reported, ...reports])
    await ctx.db.delete("guideReports", row._id);
  for (const row of [...blocks, ...blockedBy])
    await ctx.db.delete("guideBlocks", row._id);
  return [likes, comments, reported, reports, blocks, blockedBy].every(
    (rows) => rows.length < limit,
  );
}
