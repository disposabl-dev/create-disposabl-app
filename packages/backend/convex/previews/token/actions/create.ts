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
import { ensureDevelopment, productionDeployment } from "./management";

export const create = internalAction({
  args: { ...identityFields, ...previewIdentity },
  returns: v.object({
    appId: v.string(),
    ...deployment.fields,
    deployKey: v.string(),
    productionConvexSiteUrl: v.optional(v.string()),
    repositoryUrl: v.optional(v.string()),
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
    productionConvexSiteUrl?: string;
    repositoryUrl?: string;
  }> => {
    validateReference(args.reference);
    const identity = { userId: args.userId, appId: args.appId };
    const { until } = await ctx.runMutation(
      internal.apps.operations.internal.begin,
      {
        ...identity,
        kind: "setup",
      },
    );
    try {
      await ctx.runMutation(internal.previews.internal.create, args);
      const projectId = await ctx.runAction(internal.apps.actions.setup.setup, {
        userId: args.userId,
        appId: args.appId,
      });
      const token = (await credential(ctx, args.userId, "convex")).token;
      const production = await productionDeployment(token, projectId);
      const app = await ctx.runQuery(internal.apps.internal.get, identity);
      if (!app.githubOwner || !app.githubRepo)
        throw new Error("App repository setup is incomplete.");
      const { deployKey, ...deployment } = await ensureDevelopment(
        token,
        projectId,
        args.reference,
      );
      await ctx.runMutation(internal.previews.internal.finish, {
        ...args,
        deployment,
      });
      return {
        appId: args.appId,
        ...deployment,
        deployKey,
        productionConvexSiteUrl: production.deploymentUrl.replace(
          /\.convex\.cloud\/?$/,
          ".convex.site",
        ),
        repositoryUrl: `https://github.com/${app.githubOwner}/${app.githubRepo}.git`,
      };
    } finally {
      await ctx.runMutation(internal.apps.operations.internal.finish, {
        ...identity,
        until,
        retryDelete: false,
      });
    }
  },
});
