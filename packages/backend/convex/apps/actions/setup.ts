"use node";

import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { credential } from "../../connections/actions/credentials";
import {
  ensureProject,
  management,
} from "../../previews/token/actions/management";

export const setup = internalAction({
  args: { ...identityFields, appId: v.string() },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const saved = await ctx.runQuery(internal.apps.internal.project, args);
    const { token, accountId: teamId } = await credential(
      ctx,
      args.userId,
      "convex",
    );
    if (saved !== null) {
      const projects = await management<{ items: { id: number }[] }>(
        token,
        `/teams/${teamId}/projects?q=${encodeURIComponent(`disposabl-${args.appId}`)}&limit=100`,
      );
      if (!projects.items.some((project) => project.id === saved))
        throw new Error(
          "Reconnect the Convex team that owns this app before continuing setup.",
        );
    }
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
