import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { internal } from "../../_generated/api";
import { appArgs, appResult } from "../../validator";
import { ConvexError, type Infer } from "convex/values";
import { resolveFeatures } from "@disposabl/disposabl-kit/feature-options";
import { requireConnections } from "../../connections/config";
type AppResult = Infer<typeof appResult>;

export const create = internalAction({
  platforms: true,
  args: { ...identityFields, ...appArgs },
  returns: appResult,
  handler: async (ctx, args): Promise<AppResult> => {
    const features = resolveFeatures(args.features ?? []);
    const connections = await ctx.runQuery(
      internal.connections.internal.status,
      { userId: args.userId, features },
    );
    requireConnections(connections);
    if (
      args.platforms.some((p) => p === "ios" || p === "android") &&
      !connections.expo
    )
      throw new ConvexError(
        "Connect Expo at https://www.disposabl.dev/dashboard/connections before creating a mobile app.",
      );
    // Return the UUID before external setup so the CLI can save it and resume safely.
    return ctx.runMutation(internal.apps.internal.insert, {
      ...args,
      features,
      appId: crypto.randomUUID(),
    });
  },
});
