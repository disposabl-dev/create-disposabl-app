import { v } from "convex/values";

export const mcpDeletionProgress = v.object({
  state: v.union(v.literal("in_progress"), v.literal("attributed_complete")),
  batches: v.number(),
  requestsDeleted: v.number(),
  tokensDeleted: v.number(),
  grantsDeleted: v.number(),
  updatedAt: v.number(),
});

export const authDeletionProgress = v.object({
  state: v.union(v.literal("in_progress"), v.literal("linked_auth_cleared")),
  batches: v.number(),
  passwordsDeleted: v.number(),
  usernamesDeleted: v.optional(v.number()),
  emailsDeleted: v.optional(v.number()),
  emailChallengesDeleted: v.optional(v.number()),
  usernameCleared: v.optional(v.boolean()),
  attributedEmailsCleared: v.optional(v.boolean()),
  unattributedEmailChallengesUnverified: v.optional(v.literal(true)),
  accountsDeleted: v.number(),
  sessionsDeleted: v.number(),
  refreshTokensDeleted: v.number(),
  passwordsCleared: v.boolean(),
  linkedRowsCleared: v.boolean(),
  legacyOrphansUnverified: v.literal(true),
  updatedAt: v.number(),
});

export const fileDeletionProgress = v.object({
  state: v.union(
    v.literal("in_progress"),
    v.literal("blocked"),
    v.literal("known_convex_cleared"),
  ),
  cursor: v.union(v.string(), v.null()),
  batches: v.number(),
  blobsDeleted: v.number(),
  missingBlobs: v.number(),
  sharedInScan: v.number(),
  r2Present: v.boolean(),
  knownConvexCleared: v.boolean(),
  untrackedStorageUnverified: v.literal(true),
  updatedAt: v.number(),
});

export const profile = v.object({
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  picture: v.optional(v.string()),
});

export const account = v.object({
  username: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  profile: v.union(profile, v.null()),
  passwordMethod: v.union(v.literal("username"), v.literal("email"), v.null()),
});

export const ephemeralDeletionProgress = v.object({
  requestedAt: v.number(),
  state: v.union(
    v.literal("in_progress"),
    v.literal("known_user_bound_cleared"),
  ),
  batches: v.number(),
  billingHandoffsDeleted: v.number(),
  telemetryIdentitiesDeleted: v.number(),
  updatedAt: v.number(),
});
