import {
  identityFields,
  internalMutation,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import { ownedApp } from "../../apps/model";
import { previewIdentity, deployment } from "../model";
import { findPreview } from "../internal";

export const acquire = internalMutation({
  args: { ...identityFields, ...previewIdentity },
  returns: v.object({
    projectId: v.union(v.number(), v.null()),
    lease: v.number(),
  }),
  handler: async (ctx, args) => {
    const app = await ownedApp(ctx, args.userId, args.appId);
    if ((app.provisioningUntil ?? 0) > Date.now())
      throw new ConvexError(
        "Another token request is in progress. Retry shortly.",
      );
    const lease = Date.now() + 180_000;
    await ctx.db.patch("apps", app._id, { provisioningUntil: lease });
    return { projectId: app.convexProjectId ?? null, lease };
  },
});
export const saveProject = internalMutation({
  args: {
    ...identityFields,
    appId: v.string(),
    projectId: v.number(),
    lease: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const app = await ownedApp(ctx, args.userId, args.appId);
    if (app.provisioningUntil !== args.lease)
      throw new ConvexError("Provisioning lease expired. Retry.");
    await ctx.db.patch("apps", app._id, { convexProjectId: args.projectId });
    return null;
  },
});
export const finish = internalMutation({
  args: {
    ...identityFields,
    ...previewIdentity,
    lease: v.number(),
    deployment: v.optional(deployment),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const app = await ownedApp(ctx, args.userId, args.appId);
    if (app.provisioningUntil !== args.lease)
      throw new ConvexError("Provisioning lease expired. Retry.");
    if (args.deployment) {
      const preview = await findPreview(ctx, args);
      if (!preview) throw new ConvexError("Preview not found.");
      await ctx.db.patch("previews", preview._id, {
        deployment: args.deployment,
        updatedAt: Date.now(),
      });
    }
    await ctx.db.patch("apps", app._id, { provisioningUntil: undefined });
    return null;
  },
});
