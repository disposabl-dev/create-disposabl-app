import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { query, mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ id: v.id("users"), username: v.union(v.string(), v.null()) }),
  ),
  handler: async (
    ctx,
  ): Promise<{ id: Id<"users">; username: string | null } | null> => {
    const userId = await getAuthUserId(ctx);
    return userId === null
      ? null
      : ctx.runQuery(internal.users.internal.current, { userId });
  },
});

const deletionStatusResult = v.union(
  v.null(),
  v.object({ status: v.literal("requested"), requestedAt: v.number() }),
);

export const deletionStatus = query({
  args: {},
  returns: deletionStatusResult,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const id = ctx.db.normalizeId("users", userId);
    const user = id ? await ctx.db.get("users", id) : null;
    return user?.deletionRequestedAt === undefined
      ? null
      : { status: "requested" as const, requestedAt: user.deletionRequestedAt };
  },
});

export const requestDeletion = mutation({
  args: { confirmation: v.string() },
  returns: v.object({
    status: v.literal("requested"),
    requestedAt: v.number(),
  }),
  handler: async (ctx, { confirmation }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Sign in to request account deletion.");
    if (confirmation !== "DELETE")
      throw new ConvexError("Type DELETE to confirm.");
    const id = ctx.db.normalizeId("users", userId);
    const user = id ? await ctx.db.get("users", id) : null;
    if (!id || !user) throw new ConvexError("Account not found.");
    const requestedAt = user.deletionRequestedAt ?? Date.now();
    if (user.deletionRequestedAt === undefined)
      await ctx.db.patch("users", id, { deletionRequestedAt: requestedAt });
    return { status: "requested" as const, requestedAt };
  },
});
