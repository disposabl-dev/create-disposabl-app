import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { internal } from "../../_generated/api";
import { appArgs, appResult } from "../../schema";
import type { Infer } from "convex/values";
type AppResult = Infer<typeof appResult>;

export const create = internalAction({
  platforms: true,
  args: { ...identityFields, ...appArgs },
  returns: appResult,
  handler: async (ctx, args): Promise<AppResult> =>
    ctx.runMutation(internal.apps.internal.insert, {
      ...args,
      appId: args.appId ?? crypto.randomUUID(),
    }),
});
