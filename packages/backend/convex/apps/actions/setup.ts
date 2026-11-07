"use node";

import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { scheduleTelemetry } from "@disposabl/disposabl-kit/server/lib/telemetry";
import { internal } from "../../_generated/api";
import { platform, feature } from "../../validator";
import { credential } from "../../connections/actions/credentials";
import { requireConnections } from "../../connections/config";
import { ensurePosthog } from "./posthog";
import {
  ensureProject,
  management,
} from "../../previews/token/actions/management";

export const setup = internalAction({
  args: {
    ...identityFields,
    appId: v.string(),
    platforms: v.array(platform),
    features: v.array(feature),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const startedAt = Date.now();
    const identity = { userId: args.userId, appId: args.appId };
    try {
      requireConnections(
        await ctx.runQuery(internal.connections.internal.status, {
          userId: args.userId,
          features: args.features,
        }),
        args.platforms,
      );
      await ensurePosthog(ctx, args.userId, args.appId, args.features);
      const saved = await ctx.runQuery(
        internal.apps.internal.project,
        identity,
      );
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
      const projectId =
        saved ?? (await ensureProject(token, teamId, args.appId));
      if (saved === null)
        await ctx.runMutation(internal.apps.internal.saveProject, {
          ...identity,
          projectId,
        });
      await ctx.runAction(internal.github.actions.provision.run, identity);
      await ctx.runAction(internal.github.actions.secrets.configure, {
        ...identity,
        platforms: args.platforms,
        projectId,
      });
      await scheduleTelemetry(
        ctx,
        "app_setup",
        {
          app_id: args.appId,
          outcome: "success",
          duration_ms: Date.now() - startedAt,
        },
        args.userId,
      );
      return projectId;
    } catch (error) {
      await scheduleTelemetry(
        ctx,
        "app_setup",
        {
          app_id: args.appId,
          outcome: "error",
          duration_ms: Date.now() - startedAt,
        },
        args.userId,
      );
      throw error;
    }
  },
});
