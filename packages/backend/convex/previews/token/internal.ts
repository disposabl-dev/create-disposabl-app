import {
  identityFields,
  internalAction,
  internalMutation,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import {
  deployment,
  previewIdentity,
  requestedConfiguration,
  androidArchitecture,
} from "../../validator";
import { ConvexError } from "convex/values";
import { ownedApp } from "../../apps/internal";
import { validateAndroidArchitectures } from "../../../../disposabl-kit/android-architectures";
import { analyticsConfig } from "../../connections/validator";

export const create = internalAction({
  platforms: true,
  args: {
    ...identityFields,
    ...previewIdentity,
    ...requestedConfiguration,
    configurationLease: v.optional(v.boolean()),
  },
  returns: v.object({
    appId: v.string(),
    ...deployment.fields,
    deployKey: v.string(),
    productionConvexSiteUrl: v.optional(v.string()),
    repositoryUrl: v.optional(v.string()),
    analytics: v.optional(analyticsConfig),
    configurationLeaseUntil: v.optional(v.number()),
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
    configurationLeaseUntil?: number;
  }> => ctx.runAction(internal.previews.token.actions.create.create, args),
});

// Stage server-validated selections under the existing setup lease.
export const stage = internalMutation({
  args: {
    ...identityFields,
    appId: v.string(),
    until: v.number(),
    androidArchitectures: v.array(androidArchitecture),
  },
  returns: v.null(),
  handler: async (ctx, { userId, appId, until, androidArchitectures }) => {
    const app = await ownedApp(ctx, userId, appId);
    if (
      app.operation?.kind !== "setup" ||
      app.operation.until !== until ||
      until <= Date.now()
    )
      throw new ConvexError("App setup lease expired. Retry setup.");
    await ctx.db.patch("apps", app._id, {
      operation: {
        ...app.operation,
        androidArchitectures:
          validateAndroidArchitectures(androidArchitectures),
      },
    });
    return null;
  },
});

// The authenticated caller attests that local configuration finished successfully.
export const complete = internalMutation({
  platforms: true,
  args: { ...identityFields, appId: v.string(), until: v.number() },
  returns: v.null(),
  handler: async (ctx, { userId, appId, until }) => {
    const app = await ownedApp(ctx, userId, appId);
    if (
      app.operation?.kind !== "setup" ||
      app.operation.until !== until ||
      until <= Date.now() ||
      !app.operation.androidArchitectures
    )
      throw new ConvexError(
        "App setup lease expired or already completed. Retry setup.",
      );
    await ctx.db.patch("apps", app._id, {
      androidArchitectures: app.operation.androidArchitectures,
      operation: undefined,
    });
    return null;
  },
});
