"use node";
import { internalAction } from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { authorize } from "./internal";
import { credential } from "../../connections/actions/credentials";
import { management } from "../../previews/token/actions/management";
import { convexSitePattern } from "../../gateway/model";

export const register = internalAction({
  args: { appId: v.string(), token: v.string(), convexSiteUrl: v.string() },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    const verified = await authorize(ctx, args.appId, args.token);
    if (!convexSitePattern.test(args.convexSiteUrl))
      throw new Error("Invalid hosting origin.");
    const identity = { userId: verified.app.userId, appId: args.appId };
    const projectId = await ctx.runQuery(
      internal.apps.internal.project,
      identity,
    );
    if (projectId === null) throw new Error("App has no Convex project.");
    const { token } = await credential(ctx, identity.userId, "convex");
    const deployments = await management<
      {
        name: string;
        projectId: number;
        deploymentType: string;
        isDefault: boolean;
      }[]
    >(token, `/projects/${projectId}/list_deployments`);
    if (
      !deployments.some(
        (d) =>
          d.projectId === projectId &&
          `https://${d.name}.convex.site` === args.convexSiteUrl &&
          (verified.production
            ? d.deploymentType === "prod" && d.isDefault
            : d.deploymentType === "preview"),
      )
    )
      throw new Error(
        "Deployment does not belong to this app and environment.",
      );
    const url = await ctx.runMutation(internal.gateway.internal.register, {
      ...identity,
      ...(verified.production ? {} : { reference: verified.reference }),
      origin: args.convexSiteUrl,
    });
    return { url };
  },
});
