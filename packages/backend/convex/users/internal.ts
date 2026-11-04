import {
  identityFields,
  internalQuery,
  internalMutation,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { env } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import { vGoogleProfile } from "@convex-dev/auth/methods/google/server";

export const current = internalQuery({
  platforms: true,
  args: identityFields,
  returns: v.union(
    v.null(),
    v.object({ id: v.id("users"), username: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx, { userId }) => {
    const id = ctx.db.normalizeId("users", userId);
    if (!id || !(await ctx.db.get("users", id))) return null;
    return {
      id,
      username: await ctx.runQuery(components.authUsername.public.getUsername, {
        userId: id,
      }),
    };
  },
});

const authProvider = v.union(
  v.object({
    name: v.literal("emailPassword"),
    accountId: v.string(),
    profile: v.object({}),
  }),
  v.object({
    name: v.literal("password"),
    accountId: v.string(),
    profile: v.object({}),
  }),
  v.object({
    name: v.literal("google"),
    accountId: v.string(),
    profile: vGoogleProfile,
  }),
);

/**
 * Create the user row for a new provider account and return its id. This
 * example keeps no data in the row, but your app can put a profile here.
 */
export const createUser = internalMutation({
  args: {
    provider: authProvider,
  },
  returns: v.id("users"),
  handler: async (ctx, { provider }) => {
    if (env.AUTH_GOOGLE_ONLY === "true" && provider.name !== "google")
      throw new ConvexError("Use Sign in with Google for this app.");
    if (provider.name === "password" && env.RESEND_API_KEY?.trim()) {
      throw new ConvexError(
        "New accounts must use verified email and password.",
      );
    }
    return await ctx.db.insert("users", {});
  },
});

/** Enforce Google-only policy even when an old client calls password sign-in. */
export const onSignIn = internalMutation({
  args: { userId: v.id("users"), provider: authProvider },
  returns: v.null(),
  handler: async (_ctx, { provider }) => {
    if (env.AUTH_GOOGLE_ONLY === "true" && provider.name !== "google")
      throw new ConvexError("Use Sign in with Google for this app.");
    return null;
  },
});
