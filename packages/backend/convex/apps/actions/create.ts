import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { internal } from "../../_generated/api";
import { appArgs, appResult } from "../../validator";
import { ConvexError } from "convex/values";
import type { Infer } from "convex/values";
type AppResult = Infer<typeof appResult>;

export const create = internalAction({
  platforms: true,
  args: { ...identityFields, ...appArgs },
  returns: appResult,
  handler: async (ctx, args): Promise<AppResult> => {
    const connections = await ctx.runQuery(
      internal.connections.internal.status,
      { userId: args.userId },
    );
    if (!connections.ready)
      throw new ConvexError(
        "Connect GitHub and Convex at https://www.disposabl.dev/dashboard/connections, then retry setup. Your login remains active.",
      );
    // Return the UUID before external setup so the CLI can save it and resume safely.
    return ctx.runMutation(internal.apps.internal.insert, {
      ...args,
      appId: crypto.randomUUID(),
    });
  },
});
