import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { requireNotDeleting } from "../users/deletion";
import type { ActionCtx, MutationCtx } from "../_generated/server";
export async function requireFileWrite(
  ctx: ActionCtx | MutationCtx,
  userId: string,
) {
  if ("db" in ctx) return requireNotDeleting(ctx, userId);
  if (await ctx.runQuery(internal.users.internal.deletionPending, { userId }))
    throw new ConvexError(
      "Account deletion has been requested or this account no longer exists.",
    );
}
