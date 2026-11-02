import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { deleteArgs } from "../validator";

export const remove = internalAction({
  platforms: true,
  args: { ...identityFields, ...deleteArgs },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    ctx.runAction(internal.apps.actions.cleanup.remove, args),
});
