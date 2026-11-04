import {
  identityFields,
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import { posthogProject } from "../connections/validator";
import { ownedApp } from "./internal";

export const project = internalQuery({
  args: { ...identityFields, appId: v.string() },
  returns: v.union(posthogProject, v.null()),
  handler: async (ctx, { userId, appId }) =>
    (await ownedApp(ctx, userId, appId)).posthogProject ?? null,
});

export const save = internalMutation({
  args: { ...identityFields, appId: v.string(), project: posthogProject },
  returns: v.null(),
  handler: async (ctx, { userId, appId, project }) => {
    const app = await ownedApp(ctx, userId, appId);
    if (
      app.posthogProject &&
      (app.posthogProject.projectId !== project.projectId ||
        app.posthogProject.organizationId !== project.organizationId ||
        app.posthogProject.region !== project.region)
    )
      throw new ConvexError(
        "This app already has a different PostHog project.",
      );
    await ctx.db.patch("apps", app._id, { posthogProject: project });
    return null;
  },
});
