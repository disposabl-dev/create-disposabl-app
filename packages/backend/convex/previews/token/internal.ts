import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { env } from "../../_generated/server";
import { previewIdentity, deployment, validateReference } from "../model";
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
    await ctx.runMutation(internal.previews.internal.ensure, args);
    const token = env.CONVEX_TEAM_TOKEN;
    const teamId = env.CONVEX_TEAM_ID;
    if (!token || !teamId || !/^\d+$/.test(teamId))
      throw new ConvexError(
        "Managed setup requires CONVEX_TEAM_ID and CONVEX_TEAM_TOKEN on the service backend.",
      );
    const { projectId: saved, lease } = await ctx.runMutation(
      internal.previews.token.state.acquire,
      args,
    );
    try {
      const projectId =
        saved ?? (await ensureProject(token, teamId, args.appId));
      if (saved === null)
        await ctx.runMutation(internal.previews.token.state.saveProject, {
          userId: args.userId,
          appId: args.appId,
          projectId,
          lease,
        });
      const { deployKey, ...deployment } = await ensureDevelopment(
        token,
        projectId,
        args.reference,
      );
      await ctx.runMutation(internal.previews.token.state.finish, {
        ...args,
        lease,
        deployment,
      });
      return { appId: args.appId, ...deployment, deployKey };
    } catch (error) {
      await ctx.runMutation(internal.previews.token.state.finish, {
        ...args,
        lease,
      });
      throw error;
    }
  },
});
