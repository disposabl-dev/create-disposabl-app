import { getAuthUserId } from "@convex-dev/auth/server";
import { setupUsernamePassword } from "@convex-dev/auth/methods/username-password/server";
import { setupGoogle } from "@convex-dev/auth/methods/google/server";
import { auth } from "./authSetup";
import {
  googleAuthorizationState,
  googleConfigured,
} from "@disposabl/disposabl-kit/server/google";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { env, query } from "./_generated/server";
import { account as accountValidator } from "./users/validator";

export const { signOut, refreshSession, isAuthenticated } = auth;

export const {
  signUpWithUsernamePassword,
  signInWithUsernamePassword,
  changePassword,
} = setupUsernamePassword(auth, {
  component: components.authPassword,
  usernameComponent: components.authUsername,
}).attachUserCallbacks({
  createUser: internal.users.internal.createUser,
  onSignIn: internal.users.internal.onSignIn,
});

export const { startSignInWithGoogle, completeSignInWithGoogle } = setupGoogle(
  auth,
  {
    component: components.authGoogle,
    authorizationState: googleAuthorizationState,
    allowedRedirectOrigins: [
      env.CONVEX_SITE_URL,
      ...(env.AUTH_REDIRECT_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim()),
    ].filter((origin): origin is string => Boolean(origin)),
  },
).attachUserCallbacks({
  createUser: internal.users.internal.createUser,
  onSignIn: internal.users.internal.onSignIn,
});

/** Publish availability only; provider credentials stay on the backend. */
export const providers = query({
  args: {},
  returns: v.object({
    google: v.boolean(),
    googleOnly: v.boolean(),
    emailPassword: v.boolean(),
    emailDelivery: v.boolean(),
  }),
  handler: async () => ({
    google: googleConfigured(),
    googleOnly: env.AUTH_GOOGLE_ONLY === "true",
    emailPassword: Boolean(
      env.AUTH_GOOGLE_ONLY !== "true" && env.RESEND_API_KEY?.trim(),
    ),
    emailDelivery: Boolean(
      env.AUTH_GOOGLE_ONLY !== "true" &&
      env.RESEND_API_KEY?.trim() &&
      env.RESEND_FROM_EMAIL?.trim(),
    ),
  }),
});

/** Password capabilities for the signed-in account, never supplied by the client. */
export const account = query({
  args: {},
  returns: v.union(v.null(), accountValidator),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const id = ctx.db.normalizeId("users", userId);
    const user = id ? await ctx.db.get("users", id) : null;
    if (!user) return null;
    const username = await ctx.runQuery(
      components.authUsername.public.getUsername,
      {
        userId,
      },
    );
    const email = await ctx.runQuery(
      components.authEmail.verifiedEmails.getPrimaryEmail,
      { userId },
    );
    return {
      username,
      email,
      profile: user.profile ?? null,
      passwordMethod:
        env.AUTH_GOOGLE_ONLY === "true"
          ? null
          : email
            ? ("email" as const)
            : username
              ? ("username" as const)
              : null,
    };
  },
});
