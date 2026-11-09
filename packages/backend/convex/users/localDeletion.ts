import { ConvexError, v } from "convex/values";
import { internalMutation } from "@disposabl/disposabl-kit/server/lib/functions";
import { internal } from "../_generated/api";

const stage = v.union(
  v.literal("mcp"),
  v.literal("auth"),
  v.literal("ephemeral"),
  v.literal("files"),
  v.literal("external_and_retention"),
);
const blockers = [
  "Remote work drain and provider cleanup remain unverified.",
  "User-owned records, external resources, financial records, receipts and retention require reconciliation.",
  "Unattributed MCP and auth records, challenges and untracked storage remain unverified.",
  "Permanent component fences and identity cutoffs require a retention decision.",
];

type Result = {
  status: "requested";
  stage: "mcp" | "auth" | "ephemeral" | "files" | "external_and_retention";
  outcome: "advanced" | "blocked" | "local_stages_cleared";
  blockers: string[];
};

/** Explicit operator invocation; each call advances at most one local stage. */
export const advanceLocalBatch = internalMutation({
  args: { userId: v.id("users"), expectedRequestedAt: v.number() },
  returns: v.object({
    status: v.literal("requested"),
    stage,
    outcome: v.union(
      v.literal("advanced"),
      v.literal("blocked"),
      v.literal("local_stages_cleared"),
    ),
    blockers: v.array(v.string()),
  }),
  handler: async (ctx, args): Promise<Result> => {
    const user = await ctx.db.get("users", args.userId);
    if (
      !user ||
      user.deletionRequestedAt === undefined ||
      user.deletionRequestedAt !== args.expectedRequestedAt
    )
      throw new ConvexError("Matching deletion request not found.");
    if (user.mcpDeletion?.state !== "attributed_complete") {
      await ctx.runMutation(internal.users.mcpDeletion.runBatch, args);
      return {
        status: "requested",
        stage: "mcp",
        outcome: "advanced",
        blockers: [],
      };
    }
    if (user.authDeletion?.state !== "linked_auth_cleared") {
      await ctx.runMutation(internal.users.authDeletion.runBatch, args);
      return {
        status: "requested",
        stage: "auth",
        outcome: "advanced",
        blockers: [],
      };
    }
    if (
      user.ephemeralDeletion?.requestedAt !== args.expectedRequestedAt ||
      user.ephemeralDeletion.state !== "known_user_bound_cleared"
    ) {
      await ctx.runMutation(internal.users.ephemeralDeletion.runBatch, args);
      return {
        status: "requested",
        stage: "ephemeral",
        outcome: "advanced",
        blockers: [],
      };
    }
    if (user.fileDeletion?.state !== "known_convex_cleared") {
      const result = await ctx.runMutation(
        internal.users.fileDeletion.runBatch,
        args,
      );
      return result.state === "blocked"
        ? {
            status: "requested",
            stage: "files",
            outcome: "blocked",
            blockers: [
              "R2 files or shared Convex storage require operator reconciliation.",
            ],
          }
        : {
            status: "requested",
            stage: "files",
            outcome: "advanced",
            blockers: [],
          };
    }
    return {
      status: "requested",
      stage: "external_and_retention",
      outcome: "local_stages_cleared",
      blockers,
    };
  },
});
