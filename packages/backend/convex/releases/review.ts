import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";

const requestResult = v.object({
  requestId: v.string(),
  commit: v.string(),
  url: v.string(),
});
const statusResult = v.union(
  v.null(),
  v.object({
    status: v.string(),
    conclusion: v.union(v.null(), v.string()),
    url: v.string(),
  }),
);

export const request = internalAction({
  platforms: true,
  args: {
    ...identityFields,
    appId: v.string(),
    commit: v.string(),
    platforms: v.array(v.union(v.literal("ios"), v.literal("android"))),
  },
  returns: requestResult,
  handler: (ctx, args): Promise<Infer<typeof requestResult>> =>
    ctx.runAction(internal.releases.actions.storeReview.request, args),
});

export const status = internalAction({
  platforms: true,
  args: { ...identityFields, appId: v.string(), requestId: v.string() },
  returns: statusResult,
  handler: (ctx, args): Promise<Infer<typeof statusResult>> =>
    ctx.runAction(internal.releases.actions.storeReview.status, args),
});
