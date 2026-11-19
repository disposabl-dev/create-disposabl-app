import {
  internalMutation,
  internalQuery,
  identityFields,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v, type Infer } from "convex/values";
import { components } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { ownedApp } from "./internal";
import { autumnTenant } from "./validator";
import { siteFor } from "../gateway/model";

function assertSetup(app: Doc<"apps">, until: number) {
  if (
    app.operation?.kind !== "setup" ||
    app.operation.until !== until ||
    until <= Date.now()
  )
    throw new ConvexError("App setup expired. Try again.");
}

const identity = { ...identityFields, appId: v.string() };
const setup = { ...identity, until: v.number() };

export const prepare = internalMutation({
  args: setup,
  returns: autumnTenant,
  handler: async (
    ctx,
    { userId, appId, until },
  ): Promise<Infer<typeof autumnTenant>> => {
    const app = await ownedApp(ctx, userId, appId);
    assertSetup(app, until);
    if (app.autumn) return app.autumn;
    const id = ctx.db.normalizeId("users", userId);
    const user = id ? await ctx.db.get("users", id) : null;
    if (!user || user.deletionRequestedAt !== undefined)
      throw new ConvexError(
        "An active account is required to set up payments.",
      );
    // The stored Google profile only contains email when the provider verified it.
    const email =
      user.profile?.email ??
      (await ctx.runQuery(components.authEmail.verifiedEmails.getPrimaryEmail, {
        userId,
      }));
    if (!email)
      throw new ConvexError(
        "Sign in with a verified email to enable payments.",
      );
    const autumn = { ownerEmail: email };
    await ctx.db.patch("apps", app._id, { autumn });
    return autumn;
  },
});

export const saveKeys = internalMutation({
  args: { ...setup, encryptedKeys: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, appId, until, encryptedKeys }) => {
    const app = await ownedApp(ctx, userId, appId);
    assertSetup(app, until);
    if (!app.autumn || app.autumn.encryptedKeys)
      throw new ConvexError("App payment setup changed. Try again.");
    await ctx.db.patch("apps", app._id, {
      autumn: { ...app.autumn, encryptedKeys },
    });
    return null;
  },
});

export const target = internalQuery({
  args: identity,
  returns: v.object({
    encryptedKeys: v.string(),
    projectId: v.number(),
    publicSiteUrl: v.optional(v.string()),
  }),
  handler: async (ctx, { userId, appId }) => {
    const app = await ownedApp(ctx, userId, appId);
    if (
      !app.features?.includes("payments") ||
      !app.autumn?.encryptedKeys ||
      !app.convexProjectId ||
      app.operation?.kind === "delete"
    )
      throw new ConvexError(
        "Finish setting up this app with Payments before connecting Stripe.",
      );
    return {
      encryptedKeys: app.autumn.encryptedKeys,
      projectId: app.convexProjectId,
      publicSiteUrl: await siteFor(ctx, appId),
    };
  },
});
