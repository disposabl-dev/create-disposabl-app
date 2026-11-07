import { getSessionUserId } from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v, type Infer } from "convex/values";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { action, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { feature } from "../validator";
import {
  account,
  completion,
  connectionStatus,
  oauthProvider,
  provider,
  posthogRegion,
} from "./validator";

async function requireUser(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const id = await getSessionUserId(ctx);
  if (!id) throw new ConvexError("Sign in to manage your connections.");
  return id;
}
export const status = query({
  args: { features: v.optional(v.array(feature)) },
  returns: connectionStatus,
  handler: async (ctx, args): Promise<Infer<typeof connectionStatus>> =>
    ctx.runQuery(internal.connections.internal.status, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
export const start = action({
  args: {
    provider: oauthProvider,
    mobile: v.optional(v.boolean()),
    install: v.optional(v.boolean()),
    region: v.optional(posthogRegion),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> =>
    ctx.runAction(internal.connections.actions.oauth.start, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
export const complete = action({
  args: { provider: oauthProvider, code: v.string(), state: v.string() },
  returns: completion,
  handler: async (ctx, args): Promise<Infer<typeof completion>> =>
    ctx.runAction(internal.connections.actions.oauth.complete, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
export const selectGithub = action({
  args: { proof: v.string(), installationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    ctx.runAction(internal.connections.actions.github.selectGithub, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
export const posthogAccounts = action({
  args: {},
  returns: v.array(account),
  handler: async (ctx): Promise<Infer<typeof account>[]> =>
    ctx.runAction(internal.connections.actions.posthog.posthogAccounts, {
      userId: await requireUser(ctx),
    }),
});
export const selectPosthog = action({
  args: { accountId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    ctx.runAction(internal.connections.actions.posthog.selectPosthog, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
export const expoAccounts = action({
  args: { token: v.string() },
  returns: v.array(account),
  handler: async (ctx, args): Promise<Infer<typeof account>[]> =>
    ctx.runAction(internal.connections.actions.expo.expoAccounts, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
export const connectExpo = action({
  args: { token: v.string(), accountId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    ctx.runAction(internal.connections.actions.expo.connectExpo, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
export const disconnect = mutation({
  args: { provider },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    ctx.runMutation(internal.connections.internal.disconnect, {
      ...args,
      userId: await requireUser(ctx),
    }),
});

export const resumeGithubInstall = action({
  args: { state: v.string() },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> =>
    ctx.runAction(internal.connections.actions.oauth.resumeGithubInstall, {
      ...args,
      userId: await requireUser(ctx),
    }),
});

export const connectAutumn = action({
  args: { sandboxKey: v.string(), liveKey: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    ctx.runAction(internal.connections.actions.autumn.connect, {
      ...args,
      userId: await requireUser(ctx),
    }),
});
