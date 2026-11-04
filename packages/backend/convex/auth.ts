import { setupUsernamePassword } from "@convex-dev/auth/methods/username-password/server";
import { setupGoogle } from "@convex-dev/auth/methods/google/server";
import { setupConvexAuth } from "@convex-dev/auth/server";
import {
  googleAuthorizationState,
  googleConfigured,
} from "@disposabl/disposabl-kit/server/google";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { env, query } from "./_generated/server";

const auth = setupConvexAuth({ component: components.auth });
export const { signOut, refreshSession, isAuthenticated } = auth;

export const {
  signUpWithUsernamePassword,
  signInWithUsernamePassword,
  changePassword,
} = setupUsernamePassword(auth, {
  component: components.authPassword,
  usernameComponent: components.authUsername,
}).attachUserCallbacks({ createUser: internal.users.internal.createUser });

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
).attachUserCallbacks({ createUser: internal.users.internal.createUser });

/** Publish availability only; provider credentials stay on the backend. */
export const providers = query({
  args: {},
  returns: v.object({ google: v.boolean() }),
  handler: async () => ({
    google: googleConfigured(),
  }),
});
