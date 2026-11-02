"use node";

import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import { credential } from "../../../connections/actions/credentials";
import { previewIdentity, deployment } from "../../../validator";
import { validateReference } from "../../internal";
import { ensureDevelopment } from "./management";

export const create = internalAction({
  args: { ...identityFields, ...previewIdentity },
  returns: v.object({
    appId: v.string(),
    ...deployment.fields,
    deployKey: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    appId: string;
    name: string;
    reference: string;
    convexUrl: string;
    convexSiteUrl: string;
    deployKey: string;
  }> => {
    validateReference(args.reference);
    // Authorization precedes all external calls. Tokens never enter the database.
    await ctx.runQuery(internal.apps.internal.get, {
      userId: args.userId,
      appId: args.appId,
    });
    await ctx.runMutation(internal.previews.internal.create, args);
    const projectId = await ctx.runAction(internal.apps.actions.setup.setup, {
      userId: args.userId,
      appId: args.appId,
    });
    const { deployKey, ...deployment } = await ensureDevelopment(
      (await credential(ctx, args.userId, "convex")).token,
      projectId,
      args.reference,
    );
    await ctx.runMutation(internal.previews.internal.finish, {
      ...args,
      deployment,
    });
    return { appId: args.appId, ...deployment, deployKey };
  },
});
