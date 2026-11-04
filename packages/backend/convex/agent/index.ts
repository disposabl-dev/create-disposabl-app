import { getSessionUserId } from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import {
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
} from "../_generated/server";
import { history, historyArgs, result, sendArgs } from "./validator";

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getSessionUserId(ctx);
  if (!userId) throw new ConvexError("Sign in to use the agent.");
  return userId;
}
export const sendMessage = mutation({
  args: sendArgs,
  returns: result,
  handler: async (ctx, args): Promise<Infer<typeof result>> =>
    ctx.runMutation(internal.agent.internal.sendMessage, {
      ...args,
      userId: await requireUser(ctx),
    }),
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
  returns: history,
  handler: async (ctx, args): Promise<Infer<typeof history>> =>
    ctx.runQuery(internal.agent.internal.getMessages, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
