import { deletionPending as isDeletionPending } from "./deletion";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
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
 * Display identity comes from the provider's verified claims.
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
    return await ctx.db.insert(
      "users",
      provider.name === "google"
        ? { profile: displayProfile(provider.profile) }
        : {},
    );
  },
});

/** Enforce Google-only policy even when an old client calls password sign-in. */
export const onSignIn = internalMutation({
  args: { userId: v.id("users"), provider: authProvider },
  returns: v.null(),
  handler: async (ctx, { userId, provider }) => {
    if (env.AUTH_GOOGLE_ONLY === "true" && provider.name !== "google")
      throw new ConvexError("Use Sign in with Google for this app.");
    if (provider.name === "google")
      await ctx.db.patch("users", userId, {
        profile: displayProfile(provider.profile),
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

/** Internal operator queue: requested means cleanup and remote stop remain unconfirmed. */
export const deletionRequests = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      userId: v.id("users"),
      requestedAt: v.number(),
      status: v.literal("requested"),
      blockers: v.array(v.string()),
    }),
  ),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("users")
      .withIndex("by_deletionRequestedAt", (q) =>
        q.gt("deletionRequestedAt", 0),
      )
      .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map((user) => ({
        userId: user._id,
        requestedAt: user.deletionRequestedAt!,
        status: "requested" as const,
        blockers: [
          "remote_stop",
          "data_cleanup",
          "provider_cleanup",
          "session_revocation",
        ],
      })),
    };
  },
});

export const deletionPending = internalQuery({
  args: identityFields,
  returns: v.boolean(),
  handler: (ctx, { userId }) => isDeletionPending(ctx, userId),
});
