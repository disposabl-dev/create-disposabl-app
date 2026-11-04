"use node";

import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { captureTelemetry } from "@disposabl/disposabl-kit/server/lib/telemetry";
import { internal } from "../../_generated/api";
import { credential } from "../../connections/actions/credentials";
import { requireConnections } from "../../connections/config";
import { ensurePosthog } from "./posthog";
import {
  ensureProject,
  management,
} from "../../previews/token/actions/management";

export const setup = internalAction({
  args: { ...identityFields, appId: v.string() },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const startedAt = Date.now();
    try {
      const app = await ctx.runQuery(internal.apps.internal.get, args);
      requireConnections(
        await ctx.runQuery(internal.connections.internal.status, {
          userId: args.userId,
          features: app.features,
        }),
      );
      await ensurePosthog(ctx, args.userId, args.appId);
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
      const projectId =
        saved ?? (await ensureProject(token, teamId, args.appId));
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
      await captureTelemetry("app_setup", {
        outcome: "success",
        duration_ms: Date.now() - startedAt,
      });
      return projectId;
    } catch (error) {
      await captureTelemetry("app_setup", {
        outcome: "error",
        duration_ms: Date.now() - startedAt,
      });
      throw error;
    }
  },
});
