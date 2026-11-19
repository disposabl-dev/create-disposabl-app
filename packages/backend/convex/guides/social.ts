import { ConvexError, v } from "convex/values";
import {
  englishDataset,
  englishRecommendedTransformers,
  RegExpMatcher,
} from "obscenity";
import { query, mutation, type MutationCtx } from "../_generated/server";
import { getActiveSessionUserId } from "../users/deletion";
import { changeStats, removeComment, requireLesson, statsFor } from "./model";

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});
const commentId = { commentId: v.id("guideComments") };
const lesson = { lessonId: v.string() };
const commentView = v.object({
  id: v.id("guideComments"),
  author: v.string(),
  body: v.string(),
  createdAt: v.number(),
  mine: v.boolean(),
});

async function requireViewer(ctx: MutationCtx) {
  const viewer = await getActiveSessionUserId(ctx);
  const userId = viewer && ctx.db.normalizeId("users", viewer);
  if (!userId) throw new ConvexError("Sign in to join the conversation.");
  return userId;
}

export const get = query({
  args: lesson,
  returns: v.object({
    likes: v.number(),
    comments: v.number(),
    liked: v.boolean(),
  }),
  handler: async (ctx, { lessonId }) => {
    requireLesson(lessonId);
    const viewer = await getActiveSessionUserId(ctx);
    const userId = viewer && ctx.db.normalizeId("users", viewer);
    const [stats, like] = await Promise.all([
      statsFor(ctx, lessonId),
      userId
        ? ctx.db
            .query("guideLikes")
            .withIndex("by_userId_lessonId", (q) =>
              q.eq("userId", userId).eq("lessonId", lessonId),
            )
            .unique()
        : null,
    ]);
    return {
      likes: stats?.likes ?? 0,
      comments: stats?.comments ?? 0,
      liked: Boolean(like),
    };
  },
});

export const listComments = query({
  args: lesson,
  returns: v.array(commentView),
  handler: async (ctx, { lessonId }) => {
    requireLesson(lessonId);
    const viewer = await getActiveSessionUserId(ctx);
    const userId = viewer && ctx.db.normalizeId("users", viewer);
    const rows = await ctx.db
      .query("guideComments")
      .withIndex("by_lessonId_hidden", (q) =>
        q.eq("lessonId", lessonId).eq("hidden", false),
      )
      .order("desc")
      .take(60);
    const comments = await Promise.all(
      rows.map(async (row) => {
        const [author, blocked] = await Promise.all([
          ctx.db.get("users", row.userId),
          userId
            ? ctx.db
                .query("guideBlocks")
                .withIndex("by_userId_blockedId", (q) =>
                  q.eq("userId", userId).eq("blockedId", row.userId),
                )
                .unique()
            : null,
        ]);
        if (!author || author.deletionRequestedAt !== undefined || blocked)
          return null;
        const displayName = author.profile?.name?.trim();
        return {
          id: row._id,
          author:
            displayName && !displayName.includes("@")
              ? displayName.slice(0, 80)
              : "Disposabl member",
          body: row.body,
          createdAt: row._creationTime,
          mine: row.userId === userId,
        };
      }),
    );
    return comments.filter((comment) => comment !== null).slice(0, 40);
  },
});

export const setLike = mutation({
  args: { ...lesson, liked: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { lessonId, liked }) => {
    requireLesson(lessonId);
    const userId = await requireViewer(ctx);
    const like = await ctx.db
      .query("guideLikes")
      .withIndex("by_userId_lessonId", (q) =>
        q.eq("userId", userId).eq("lessonId", lessonId),
      )
      .unique();
    if (liked && !like) {
      await ctx.db.insert("guideLikes", { userId, lessonId });
      await changeStats(ctx, lessonId, "likes", 1);
    } else if (!liked && like) {
      await ctx.db.delete("guideLikes", like._id);
      await changeStats(ctx, lessonId, "likes", -1);
    }
    return null;
  },
});

export const postComment = mutation({
  args: { ...lesson, body: v.string() },
  returns: v.null(),
  handler: async (ctx, { lessonId, body }) => {
    requireLesson(lessonId);
    const userId = await requireViewer(ctx);
    if ((await ctx.db.get("users", userId))?.guideCommentsBanned)
      throw new ConvexError("Your account cannot post guide comments.");
    const text = body.trim();
    if (!text || text.length > 600)
      throw new ConvexError("Write a comment of 1–600 characters.");
    if (matcher.hasMatch(text))
      throw new ConvexError("Please revise the comment before posting.");
    if (
      await ctx.db
        .query("guideComments")
        .withIndex("by_userId", (q) =>
          q.eq("userId", userId).gt("_creationTime", Date.now() - 15_000),
        )
        .first()
    )
      throw new ConvexError(
        "Wait a few seconds before posting another comment.",
      );
    await ctx.db.insert("guideComments", {
      lessonId,
      userId,
      body: text,
      hidden: false,
      reports: 0,
    });
    await changeStats(ctx, lessonId, "comments", 1);
    return null;
  },
});

export const deleteComment = mutation({
  args: commentId,
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireViewer(ctx);
    const comment = await ctx.db.get("guideComments", args.commentId);
    if (!comment) return null;
    if (comment.userId !== userId)
      throw new ConvexError("You can delete your own comments.");
    await removeComment(ctx, comment);
    return null;
  },
});

export const reportComment = mutation({
  args: commentId,
  returns: v.null(),
  handler: async (ctx, { commentId }) => {
    const userId = await requireViewer(ctx);
    const comment = await ctx.db.get("guideComments", commentId);
    if (!comment || comment.hidden || comment.userId === userId) return null;
    const existing = await ctx.db
      .query("guideReports")
      .withIndex("by_userId_commentId", (q) =>
        q.eq("userId", userId).eq("commentId", commentId),
      )
      .unique();
    if (existing) return null;
    await ctx.db.insert("guideReports", {
      userId,
      authorId: comment.userId,
      commentId,
      resolved: false,
    });
    const reports = comment.reports + 1;
    const hidden = reports >= 2;
    await ctx.db.patch("guideComments", commentId, { reports, hidden });
    if (hidden) await changeStats(ctx, comment.lessonId, "comments", -1);
    return null;
  },
});

export const blockCommenter = mutation({
  args: commentId,
  returns: v.null(),
  handler: async (ctx, { commentId }) => {
    const userId = await requireViewer(ctx);
    const comment = await ctx.db.get("guideComments", commentId);
    if (!comment || comment.userId === userId) return null;
    const blockedId = comment.userId;
    const existing = await ctx.db
      .query("guideBlocks")
      .withIndex("by_userId_blockedId", (q) =>
        q.eq("userId", userId).eq("blockedId", blockedId),
      )
      .unique();
    if (!existing) await ctx.db.insert("guideBlocks", { userId, blockedId });
    return null;
  },
});
