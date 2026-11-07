import { getSessionUserId } from "@disposabl/disposabl-kit/server/lib/functions";
import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import { query } from "../_generated/server";
import { previewResult } from "../validator";

export const list = query({
  args: { appId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(previewResult),
  handler: async (
    ctx,
    args,
  ): Promise<PaginationResult<Infer<typeof previewResult>>> => {
    const userId = await getSessionUserId(ctx);
    if (!userId) throw new ConvexError("Sign in to view deployments.");
    return ctx.runQuery(internal.previews.internal.list, { ...args, userId });
  },
});
