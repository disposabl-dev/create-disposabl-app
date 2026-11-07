"use node";

import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { resolveFeatures } from "@disposabl/disposabl-kit/feature-options";
import { validatePlatforms } from "@disposabl/disposabl-kit/platforms";
import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import { credential } from "../../../connections/actions/credentials";
import {
  previewIdentity,
  deployment,
  requestedConfiguration,
} from "../../../validator";
import { validateReference } from "../../internal";
import { ensureDevelopment, productionDeployment } from "./management";
import { provisionPayments } from "../../../apps/actions/billing";
import { analyticsConfig } from "../../../connections/validator";

export const create = internalAction({
  args: { ...identityFields, ...previewIdentity, ...requestedConfiguration },
  returns: v.object({
    appId: v.string(),
    ...deployment.fields,
    deployKey: v.string(),
    productionConvexSiteUrl: v.optional(v.string()),
    repositoryUrl: v.optional(v.string()),
    analytics: v.optional(analyticsConfig),
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
    analytics?: { projectId: number; projectToken: string; host: string };
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
      const current = await ctx.runQuery(internal.apps.internal.get, identity);
      const platforms = validatePlatforms(args.platforms ?? current.platforms);
      const features = resolveFeatures(args.features ?? current.features ?? []);
      const preview = { ...identity, reference: args.reference };
      await ctx.runMutation(internal.previews.internal.create, preview);
      const projectId = await ctx.runAction(internal.apps.actions.setup.setup, {
        userId: args.userId,
        appId: args.appId,
        platforms,
        features,
      });
      const token = (await credential(ctx, args.userId, "convex")).token;
      const production = await productionDeployment(token, projectId);
      const app = await ctx.runQuery(internal.apps.internal.get, identity);
      const posthog = features.includes("analytics")
        ? await ctx.runQuery(internal.apps.posthog.project, identity)
        : null;
      if (!app.githubOwner || !app.githubRepo)
        throw new Error("App repository setup is incomplete.");
      const { deployKey, ...deployment } = await ensureDevelopment(
        token,
        projectId,
        args.reference,
      );
      await provisionPayments(
        ctx,
        args.userId,
        features,
        token,
        { ...deployment, deployKey, kind: "dev" },
        production,
      );
      await ctx.runMutation(internal.previews.internal.finish, {
        ...preview,
        deployment,
      });
      await ctx.runMutation(internal.apps.internal.applyConfiguration, {
        ...identity,
        platforms,
        features,
        until,
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
        ...(posthog
          ? {
              analytics: {
                projectId: posthog.projectId,
                projectToken: posthog.projectToken,
                host: `https://${posthog.region}.i.posthog.com`,
              },
            }
          : {}),
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
