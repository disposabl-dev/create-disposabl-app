import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { query, mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ensureReceipt, findReceipt } from "./receipts";

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
  v.object({
    status: v.literal("requested"),
    requestedAt: v.number(),
    reference: v.union(v.string(), v.null()),
  }),
);

export const deletionStatus = query({
  args: {},
  returns: deletionStatusResult,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const id = ctx.db.normalizeId("users", userId);
    const user = id ? await ctx.db.get("users", id) : null;
    if (user?.deletionRequestedAt === undefined) return null;
    const receipt = await findReceipt(ctx, userId);
    return {
      status: "requested" as const,
      requestedAt: user.deletionRequestedAt,
      reference: receipt?.reference ?? null,
    };
  },
});

export const requestDeletion = mutation({
  args: { confirmation: v.string() },
  returns: v.object({
    status: v.literal("requested"),
    requestedAt: v.number(),
    reference: v.string(),
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
    const receipt = await ensureReceipt(ctx, userId, requestedAt);
    return {
      status: "requested" as const,
      requestedAt,
      reference: receipt.reference,
    };
  },
});

/** Backfill only an already-authenticated, previously requested deletion. */
export const ensureDeletionReceipt = mutation({
  args: {},
  returns: v.object({
    status: v.literal("requested"),
    requestedAt: v.number(),
    reference: v.string(),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Sign in to access your request.");
    const id = ctx.db.normalizeId("users", userId);
    const user = id ? await ctx.db.get("users", id) : null;
    if (!user || user.deletionRequestedAt === undefined)
      throw new ConvexError("Deletion request not found.");
    const receipt = await ensureReceipt(ctx, userId, user.deletionRequestedAt);
    return {
      status: "requested" as const,
      requestedAt: user.deletionRequestedAt,
      reference: receipt.reference,
    };
  },
});
