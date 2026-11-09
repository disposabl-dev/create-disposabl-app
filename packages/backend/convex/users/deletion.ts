import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { getSessionUserId } from "@disposabl/disposabl-kit/server/lib/functions";
import { internal } from "../_generated/api";

/** A displaced session can still have an activation action in flight. */
export async function hasLiveActivation(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
  now: number,
) {
  return Boolean(
    await ctx.db
      .query("computeSessions")
      .withIndex("by_userId_activationUntil", (q) =>
        q.eq("userId", userId).gt("activationLease.until", now),
      )
      .first(),
  );
}

export async function deletionPending(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
) {
  const id = ctx.db.normalizeId("users", userId);
  const user = id ? await ctx.db.get("users", id) : null;
  // Removing an owner must never reopen access through surviving app records.
  return !user || user.deletionRequestedAt !== undefined;
}

export async function requireNotDeleting(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
) {
  if (await deletionPending(ctx, userId))
    throw new ConvexError(
      "Account deletion has been requested or this account no longer exists. Contact support for assistance.",
    );
}

/** Native product entry points treat a pending or removed account as signed out. */
export async function getActiveSessionUserId(
  ctx: QueryCtx | MutationCtx | ActionCtx,
) {
  const userId = await getSessionUserId(ctx);
  if (!userId) return null;
  return (await ctx.runQuery(internal.users.internal.deletionPending, {
    userId,
  }))
    ? null
    : userId;
}
