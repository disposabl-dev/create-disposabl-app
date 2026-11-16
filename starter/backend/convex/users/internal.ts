import {
  identityFields,
  internalQuery,
  internalMutation,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { env } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import {
  vGoogleProfile,
  type GoogleProfile,
} from "@convex-dev/auth/methods/google/server";

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

const authMethod = v.union(
  v.object({
    name: v.literal("emailPassword"),
    profile: v.object({}),
  }),
  v.object({
    name: v.literal("usernamePassword"),
    profile: v.object({}),
  }),
  v.object({
    name: v.literal("google"),
    profile: vGoogleProfile,
  }),
);

/**
 * Create the user row for a new provider account and return its id. This
 * Display identity comes from the provider's verified claims.
 */
export const createUser = internalMutation({
  args: {
    method: authMethod,
  },
  returns: v.id("users"),
  handler: async (ctx, { method }) => {
    if (env.AUTH_GOOGLE_ONLY === "true" && method.name !== "google")
      throw new ConvexError("Use Sign in with Google for this app.");
    if (method.name === "usernamePassword" && env.RESEND_API_KEY?.trim()) {
      throw new ConvexError(
        "New accounts must use verified email and password.",
      );
    }
    return await ctx.db.insert(
      "users",
      method.name === "google"
        ? { profile: displayProfile(method.profile) }
        : {},
    );
  },
});

/** Enforce Google-only policy even when an old client calls password sign-in. */
export const onSignIn = internalMutation({
  args: { userId: v.id("users"), method: authMethod },
  returns: v.null(),
  handler: async (ctx, { userId, method }) => {
    if (env.AUTH_GOOGLE_ONLY === "true" && method.name !== "google")
      throw new ConvexError("Use Sign in with Google for this app.");
    if (method.name === "google")
      await ctx.db.patch("users", userId, {
        profile: displayProfile(method.profile),
      });
    return null;
  },
});

function displayProfile(profile: GoogleProfile) {
  return {
    ...(profile.name ? { name: profile.name } : {}),
    ...(profile.emailVerified && profile.email ? { email: profile.email } : {}),
    ...(profile.picture?.startsWith("https://")
      ? { picture: profile.picture }
      : {}),
  };
}
