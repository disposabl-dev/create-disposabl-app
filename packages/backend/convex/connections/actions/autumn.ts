"use node";

import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction, type ActionCtx } from "../../_generated/server";
import { validatePlatformKey } from "../../apps/actions/autumn";
import { identityFields } from "@disposabl/disposabl-kit/server/lib/functions";
import { autumnPlatformAccount } from "../validator";
import { seal, unseal } from "./credentials";

export const connect = internalAction({
  args: { ...identityFields, platformKey: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, platformKey }): Promise<null> => {
    const key = await validatePlatformKey(platformKey);
    return ctx.runMutation(internal.connections.internal.save, {
      userId,
      provider: "autumn",
      accountId: autumnPlatformAccount,
      name: "Autumn",
      token: seal(key, `${userId}:${autumnPlatformAccount}`),
    });
  },
});

export async function autumnPlatformKey(ctx: ActionCtx, userId: string) {
  const connection = await ctx.runQuery(internal.connections.internal.get, {
    userId,
    provider: "autumn",
  });
  if (connection?.accountId !== autumnPlatformAccount)
    throw new ConvexError("Connect Autumn in Connections to set up payments.");
  return unseal(connection.token, `${userId}:${autumnPlatformAccount}`);
}
