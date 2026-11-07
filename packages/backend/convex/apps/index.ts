import { getSessionUserId } from "@disposabl/disposabl-kit/server/lib/functions";
import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import {
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
} from "../_generated/server";
import { result as agentResult } from "../agent/validator";
import { appResult, feature, platform } from "../validator";

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getSessionUserId(ctx);
  if (!userId) throw new ConvexError("Sign in to manage apps.");
  return userId;
}
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(appResult),
  handler: async (
    ctx,
    args,
  ): Promise<PaginationResult<Infer<typeof appResult>>> =>
    ctx.runQuery(internal.apps.internal.list, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
export const get = query({
  args: { appId: v.string() },
  returns: appResult,
  handler: async (ctx, args): Promise<Infer<typeof appResult>> =>
    ctx.runQuery(internal.apps.internal.get, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
export const requestConfiguration = mutation({
  args: {
    appId: v.string(),
    platforms: v.array(platform),
    features: v.array(feature),
  },
  returns: agentResult,
  handler: async (ctx, args): Promise<Infer<typeof agentResult>> =>
    ctx.runMutation(internal.apps.internal.requestConfiguration, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
