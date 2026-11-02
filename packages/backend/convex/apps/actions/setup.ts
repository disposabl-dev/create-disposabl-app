import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { env } from "../../_generated/server";
import { ensureProject } from "../../previews/token/actions/management";

export const setup = internalAction({
  args: { ...identityFields, appId: v.string() },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const saved = await ctx.runQuery(internal.apps.internal.project, args);
    const token = env.CONVEX_TEAM_TOKEN;
    const teamId = env.CONVEX_TEAM_ID;
    if (!token || !teamId || !/^\d+$/.test(teamId))
      throw new Error(
        "Managed setup requires CONVEX_TEAM_ID and CONVEX_TEAM_TOKEN on the service backend.",
      );
    const projectId = saved ?? (await ensureProject(token, teamId, args.appId));
    if (saved === null)
      await ctx.runMutation(internal.apps.internal.saveProject, {
        ...args,
        projectId,
      });
    await ctx.runAction(internal.github.actions.provision.run, args);
    await ctx.runAction(internal.github.actions.secrets.configure, {
      ...args,
      projectId,
    });
    return projectId;
  },
});
