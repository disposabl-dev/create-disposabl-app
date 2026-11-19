import { defineTable } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { guideLessons } from "../../../disposabl-kit/guides";

export const guideTables = {
  guideStats: defineTable({
    lessonId: v.string(),
    likes: v.number(),
    comments: v.number(),
  }).index("by_lessonId", ["lessonId"]),
  guideLikes: defineTable({
    lessonId: v.string(),
    userId: v.id("users"),
  }).index("by_userId_lessonId", ["userId", "lessonId"]),
  guideComments: defineTable({
    lessonId: v.string(),
    userId: v.id("users"),
    body: v.string(),
    hidden: v.boolean(),
    reports: v.number(),
  })
    .index("by_lessonId_hidden", ["lessonId", "hidden"])
    .index("by_userId", ["userId"]),
  guideReports: defineTable({
    commentId: v.id("guideComments"),
    userId: v.id("users"),
    authorId: v.id("users"),
    resolved: v.boolean(),
  })
    .index("by_userId_commentId", ["userId", "commentId"])
    .index("by_authorId", ["authorId"])
    .index("by_commentId_resolved", ["commentId", "resolved"])
    .index("by_resolved", ["resolved"]),
  guideBlocks: defineTable({ userId: v.id("users"), blockedId: v.id("users") })
    .index("by_userId_blockedId", ["userId", "blockedId"])
    .index("by_blockedId", ["blockedId"]),
};

const lessonIds = new Set(guideLessons.map(({ id }) => id));
export function requireLesson(lessonId: string) {
  if (!lessonIds.has(lessonId)) throw new ConvexError("Guide not found.");
}

export function statsFor(ctx: Pick<QueryCtx, "db">, lessonId: string) {
  return ctx.db
    .query("guideStats")
    .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
    .unique();
}

export async function changeStats(
  ctx: MutationCtx,
  lessonId: string,
  field: "likes" | "comments",
  change: 1 | -1,
) {
  const stats = await statsFor(ctx, lessonId);
  if (stats) {
    await ctx.db.patch("guideStats", stats._id, {
      [field]: Math.max(0, stats[field] + change),
    });
  } else if (change === 1) {
    await ctx.db.insert("guideStats", {
      lessonId,
      likes: Number(field === "likes"),
      comments: Number(field === "comments"),
    });
  }
}

export async function removeComment(
  ctx: MutationCtx,
  comment: Doc<"guideComments">,
) {
  await ctx.db.delete("guideComments", comment._id);
  if (!comment.hidden) await changeStats(ctx, comment.lessonId, "comments", -1);
  await resolveReports(ctx, comment._id);
}

export async function resolveReports(
  ctx: MutationCtx,
  commentId: Doc<"guideComments">["_id"],
) {
  const reports = await ctx.db
    .query("guideReports")
    .withIndex("by_commentId_resolved", (q) =>
      q.eq("commentId", commentId).eq("resolved", false),
    )
    .take(100);
  for (const report of reports)
    await ctx.db.patch("guideReports", report._id, { resolved: true });
}
