import { getSessionUserId } from "@disposabl/disposabl-kit/server/lib/functions";
import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationResult,
} from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import {
  action,
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
  type ActionCtx,
} from "../_generated/server";
import { result as agentResult } from "../agent/validator";
import { appResult, feature, platform } from "../validator";
import { requireCurrentClient } from "../agent/credits";

async function requireUser(ctx: QueryCtx | MutationCtx | ActionCtx) {
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
  ): Promise<PaginationResult<Infer<typeof appResult>>> => {
    const userId = await getSessionUserId(ctx);
    if (!userId) return { page: [], isDone: true, continueCursor: "" };
    return ctx.runQuery(internal.apps.internal.list, {
      ...args,
      userId,
    });
  },
});
export const get = query({
  args: { appId: v.string() },
  returns: v.union(appResult, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof appResult> | null> => {
    const userId = await getSessionUserId(ctx);
    if (!userId) return null;
    return ctx.runQuery(internal.apps.internal.get, {
      ...args,
      userId,
    });
  },
});
export const requestConfigurationChecked = action({
  args: {
    appId: v.string(),
    platforms: v.array(platform),
    features: v.array(feature),
  },
  returns: agentResult,
  handler: async (ctx, args): Promise<Infer<typeof agentResult>> =>
    ctx.runAction(internal.apps.internal.requestConfiguration, {
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
  handler: async (ctx, args): Promise<Infer<typeof agentResult>> => {
    const userId = await requireUser(ctx);
    requireCurrentClient();
    return ctx.runMutation(internal.apps.internal.requestConfigurationLegacy, {
      ...args,
      userId,
    });
  },
});
