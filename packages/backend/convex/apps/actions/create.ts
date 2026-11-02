import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { internal } from "../../_generated/api";
import { appArgs, appResult } from "../../validator";
import { env } from "../../_generated/server";
import type { Infer } from "convex/values";
type AppResult = Infer<typeof appResult>;

export const create = internalAction({
  platforms: true,
  args: { ...identityFields, ...appArgs },
  returns: appResult,
  handler: async (ctx, args): Promise<AppResult> => {
    const app = await ctx.runMutation(internal.apps.internal.insert, {
      ...args,
      appId: crypto.randomUUID(),
    });
    if (env.CONVEX_TEAM_TOKEN) {
      await ctx.runAction(internal.apps.actions.setup.setup, {
        userId: args.userId,
        appId: app.appId,
      });
      return ctx.runQuery(internal.apps.internal.get, {
        userId: args.userId,
        appId: app.appId,
      });
    }
    return app;
  },
});
