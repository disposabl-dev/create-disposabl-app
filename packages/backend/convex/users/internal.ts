import {
  deletionPending as isDeletionPending,
  hasLiveActivation,
  hasLiveAgentWorker,
} from "./deletion";
import {
  authDeletionProgress,
  fileDeletionProgress,
  ephemeralDeletionProgress,
  mcpDeletionProgress,
} from "./validator";
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
      mcpDeletion: v.optional(mcpDeletionProgress),
      authDeletion: v.optional(authDeletionProgress),
      fileDeletion: v.optional(fileDeletionProgress),
      ephemeralDeletion: v.optional(ephemeralDeletionProgress),
      stopAttempt: v.optional(v.number()),
      stopUpdatedAt: v.optional(v.number()),
      stopLeaseUntil: v.optional(v.number()),
      stop: v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("unknown"),
        v.literal("failed"),
        v.literal("archived_observed"),
      ),
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
        ...(user.mcpDeletion ? { mcpDeletion: user.mcpDeletion } : {}),
        ...(user.authDeletion ? { authDeletion: user.authDeletion } : {}),
        ...(user.fileDeletion ? { fileDeletion: user.fileDeletion } : {}),
        ...(user.ephemeralDeletion
          ? { ephemeralDeletion: user.ephemeralDeletion }
          : {}),
        stop:
          user.deletionStop?.state === "running" &&
          (user.deletionStop.leaseUntil ?? 0) <= Date.now()
            ? ("unknown" as const)
            : (user.deletionStop?.state ?? ("pending" as const)),
        ...(user.deletionStop
          ? {
              stopAttempt: user.deletionStop.attempt,
              stopUpdatedAt: user.deletionStop.updatedAt,
              ...(user.deletionStop.leaseUntil
                ? { stopLeaseUntil: user.deletionStop.leaseUntil }
                : {}),
            }
          : {}),
        blockers: [
          "remote_stop",
          "data_cleanup",
          "provider_cleanup",
          "mcp_attributed_cleanup_and_historical_orphans",
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

/** One explicit operator invocation can replace an expired attempt. */
export const claimDeletionStop = internalMutation({
  args: { userId: v.id("users"), token: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId, token }) => {
    const user = await ctx.db.get("users", userId);
    if (!user?.deletionRequestedAt || !token)
      throw new ConvexError("Deletion request not found.");
    const stop = user.deletionStop;
    if (stop?.state === "running" && (stop.leaseUntil ?? 0) > Date.now())
      return false;
    if (
      (await hasLiveActivation(ctx, userId, Date.now())) ||
      (await hasLiveAgentWorker(ctx, userId, Date.now()))
    )
      return false;
    await ctx.db.patch("users", userId, {
      deletionStop: {
        state: "running",
        attempt: (stop?.attempt ?? 0) + 1,
        updatedAt: Date.now(),
        token,
        leaseUntil: Date.now() + 600000,
      },
    });
    return true;
  },
});
export const finishDeletionStop = internalMutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    outcome: v.union(
      v.literal("unknown"),
      v.literal("failed"),
      v.literal("archived_observed"),
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, { userId, token, outcome }) => {
    const user = await ctx.db.get("users", userId);
    const stop = user?.deletionStop;
    if (
      !user?.deletionRequestedAt ||
      stop?.state !== "running" ||
      stop.token !== token ||
      (stop.leaseUntil ?? 0) <= Date.now()
    )
      return false;
    if (
      (await hasLiveActivation(ctx, userId, Date.now())) ||
      (await hasLiveAgentWorker(ctx, userId, Date.now()))
    )
      return false;
    await ctx.db.patch("users", userId, {
      deletionStop: {
        state: outcome,
        attempt: stop.attempt,
        updatedAt: Date.now(),
      },
    });
    return true;
  },
});
