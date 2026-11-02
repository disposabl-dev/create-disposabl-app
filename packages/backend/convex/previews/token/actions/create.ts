import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import { internal } from "../../../_generated/api";
import { env } from "../../../_generated/server";
import { previewIdentity, deployment } from "../../../validator";
import { validateReference } from "../../internal";
import { ensureDevelopment, ensureProject } from "./management";

export const create = internalAction({
  platforms: true,
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
    const token = env.CONVEX_TEAM_TOKEN;
    const teamId = env.CONVEX_TEAM_ID;
    if (!token || !teamId || !/^\d+$/.test(teamId))
      throw new ConvexError(
        "Managed setup requires CONVEX_TEAM_ID and CONVEX_TEAM_TOKEN on the service backend.",
      );
    const saved = await ctx.runMutation(
      internal.previews.internal.create,
      args,
    );
    await ctx.runAction(internal.github.actions.provision.run, {
      userId: args.userId,
      appId: args.appId,
    });
    const projectId = saved ?? (await ensureProject(token, teamId, args.appId));
    if (saved === null)
      await ctx.runMutation(internal.previews.internal.saveProject, {
        userId: args.userId,
        appId: args.appId,
        projectId,
      });
    const { deployKey, ...deployment } = await ensureDevelopment(
      token,
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
