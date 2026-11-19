import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import { query, mutation } from "../_generated/server";
import { getActiveSessionUserId } from "../users/deletion";
import { requireLesson } from "./model";

const reactions = components.reactions.lib;
const label = "like";

export const get = query({
  args: { lessonId: v.string() },
  returns: v.object({ likes: v.number(), liked: v.boolean() }),
  handler: async (ctx, { lessonId: targetId }) => {
    requireLesson(targetId);
    const userId = await getActiveSessionUserId(ctx);
    const [counts, liked] = await Promise.all([
      ctx.runQuery(reactions.getCounts, { targetId }),
      userId
        ? ctx.runQuery(reactions.hasUserReacted, { targetId, label, userId })
        : false,
    ]);
    return {
      likes: counts.find((row) => row.label === label)?.count ?? 0,
      liked,
    };
  },
});

export const setLike = mutation({
  args: { lessonId: v.string(), liked: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { lessonId: targetId, liked }) => {
    requireLesson(targetId);
    const userId = await getActiveSessionUserId(ctx);
    if (!userId) throw new ConvexError("Sign in to like this guide.");
    await ctx.runMutation(liked ? reactions.add : reactions.remove, {
      targetId,
      label,
      userId,
    });
    return null;
  },
});
