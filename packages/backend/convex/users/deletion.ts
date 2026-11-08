import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";

export async function deletionPending(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
) {
  const id = ctx.db.normalizeId("users", userId);
  const user = id ? await ctx.db.get("users", id) : null;
  return user?.deletionRequestedAt !== undefined;
}

export async function requireNotDeleting(
  ctx: Pick<QueryCtx, "db">,
  userId: string,
) {
  if (await deletionPending(ctx, userId))
    throw new ConvexError(
      "Account deletion has been requested. Contact support for assistance.",
    );
}
