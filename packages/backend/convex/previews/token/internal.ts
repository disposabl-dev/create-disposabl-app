import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { deployment, previewIdentity } from "../../validator";

export const create = internalAction({
  platforms: true,
  args: { ...identityFields, ...previewIdentity },
  returns: v.object({
    appId: v.string(),
    ...deployment.fields,
    deployKey: v.string(),
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
  }> => ctx.runAction(internal.previews.token.actions.create.create, args),
});
