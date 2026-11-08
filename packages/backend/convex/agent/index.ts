import { getActiveSessionUserId as getSessionUserId } from "../users/deletion";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import {
  mutation,
  action,
  query,
  type QueryCtx,
  type MutationCtx,
  type ActionCtx,
} from "../_generated/server";
import { history, historyArgs, result, sendArgs } from "./validator";
import { requireCurrentClient } from "./credits";

async function requireUser(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const userId = await getSessionUserId(ctx);
  if (!userId) throw new ConvexError("Sign in to use the agent.");
  return userId;
}
export const sendMessageChecked = action({
  args: sendArgs,
  returns: result,
  handler: async (ctx, args): Promise<Infer<typeof result>> =>
    ctx.runAction(internal.agent.internal.sendMessage, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
export const sendMessage = mutation({
  args: sendArgs,
  returns: result,
  handler: async (ctx, args): Promise<Infer<typeof result>> => {
    const userId = await requireUser(ctx);
    requireCurrentClient();
    return ctx.runMutation(internal.agent.internal.enqueueMessage, {
      ...args,
      userId,
    });
  },
});
export const abortMessage = mutation({
  args: { appId: v.string() },
  returns: v.union(result, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof result> | null> =>
    ctx.runMutation(internal.agent.internal.abortMessage, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
export const getMessages = query({
  args: historyArgs,
  returns: v.union(history, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof history> | null> => {
    const userId = await getSessionUserId(ctx);
    if (!userId) return null;
    return ctx.runQuery(internal.agent.internal.getMessages, {
      ...args,
      userId,
    });
  },
});
