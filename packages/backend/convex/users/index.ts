import { getAuthUserId } from "@convex-dev/auth/server";
import { anyApi } from "convex/server";
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

/** The unguessable receipt reference grants access only to minimal status. */
export const receiptStatus = query({
  args: { reference: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      status: v.union(v.literal("requested"), v.literal("completed")),
      requestedAt: v.number(),
      completedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, { reference }) => {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        reference,
      )
    )
      return null;
    const receipt = await ctx.db
      .query("deletionReceipts")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    if (!receipt) return null;
    return {
      status:
        receipt.completedAt === undefined
          ? ("requested" as const)
          : ("completed" as const),
      requestedAt: receipt.requestedAt,
      completedAt: receipt.completedAt ?? null,
    };
  },
});

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
    if (!user.deletionAutomation) {
      const token = crypto.randomUUID();
      const nextAt = Date.now() + 3000;
      await ctx.db.patch("users", id, {
        deletionAutomation: {
          state: "scheduled",
          token,
          steps: 0,
          waits: 0,
          updatedAt: Date.now(),
          nextAt,
        },
      });
      await ctx.scheduler.runAfter(
        3000,
        anyApi.users.actions.fulfillment.automate,
        {
          userId: id,
          expectedRequestedAt: requestedAt,
          reference: receipt.reference,
          token,
        },
      );
    }
    return {
      status: "requested" as const,
      requestedAt,
      reference: receipt.reference,
    };
  },
});
