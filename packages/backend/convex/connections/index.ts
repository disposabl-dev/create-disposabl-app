import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v, type Infer } from "convex/values";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { action, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  account,
  completion,
  connectionStatus,
  oauthProvider,
  provider,
} from "./validator";

async function userId(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const id = await getAuthUserId(ctx);
  if (!id) throw new ConvexError("Sign in to manage your connections.");
  return id;
}
export const status = query({
  args: {},
  returns: connectionStatus,
  handler: async (ctx): Promise<Infer<typeof connectionStatus>> =>
    ctx.runQuery(internal.connections.internal.status, {
      userId: await userId(ctx),
    }),
});
export const start = action({
  args: { provider: oauthProvider },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> =>
    ctx.runAction(internal.connections.actions.oauth.start, {
      ...args,
      userId: await userId(ctx),
    }),
});
export const complete = action({
  args: { provider: oauthProvider, code: v.string(), state: v.string() },
  returns: completion,
  handler: async (ctx, args): Promise<Infer<typeof completion>> =>
    ctx.runAction(internal.connections.actions.oauth.complete, {
      ...args,
      userId: await userId(ctx),
    }),
});
export const selectGithub = action({
  args: { proof: v.string(), installationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    ctx.runAction(internal.connections.actions.github.selectGithub, {
      ...args,
      userId: await userId(ctx),
    }),
});
export const expoAccounts = action({
  args: { token: v.string() },
  returns: v.array(account),
  handler: async (ctx, args): Promise<Infer<typeof account>[]> =>
    ctx.runAction(internal.connections.actions.expo.expoAccounts, {
      ...args,
      userId: await userId(ctx),
    }),
});
export const connectExpo = action({
  args: { token: v.string(), accountId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    ctx.runAction(internal.connections.actions.expo.connectExpo, {
      ...args,
      userId: await userId(ctx),
    }),
});
export const disconnect = mutation({
  args: { provider },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    ctx.runMutation(internal.connections.internal.disconnect, {
      ...args,
      userId: await userId(ctx),
    }),
});
