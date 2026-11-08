import {
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import schema from "../schema";

const identity = {
  sessionId: v.id("computeSessions"),
  debitId: v.id("computeDebits"),
};

/** Internal operator inspection; IDs are supplied explicitly, never inferred from a timeout. */
export const inspect = internalQuery({
  args: identity,
  returns: v.object({
    session: v.union(schema.doc("computeSessions"), v.null()),
    debit: v.union(schema.doc("computeDebits"), v.null()),
  }),
  handler: async (ctx, { sessionId, debitId }) => ({
    session: await ctx.db.get("computeSessions", sessionId),
    debit: await ctx.db.get("computeDebits", debitId),
  }),
});

export const resolve = internalMutation({
  args: {
    ...identity,
    outcome: v.union(v.literal("confirmed"), v.literal("denied")),
    evidence: v.string(),
    operator: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fail = (message: string): never => {
      throw new ConvexError(message);
    };
    if (
      !args.evidence.trim() ||
      !args.operator.trim() ||
      args.evidence.length > 4000 ||
      args.operator.length > 200
    )
      return fail("Operator and immutable provider evidence are required.");
    const session = await ctx.db.get("computeSessions", args.sessionId);
    const debit = await ctx.db.get("computeDebits", args.debitId);
    if (
      !session ||
      !debit ||
      debit.sessionId !== session._id ||
      session.debitId !== debit._id
    )
      return fail("Session and debit do not match.");
    const latest = await ctx.db
      .query("computeSessions")
      .withIndex("by_userId", (q) => q.eq("userId", session.userId))
      .order("desc")
      .first();
    if (
      latest?._id !== session._id ||
      session.state !== "hold" ||
      !["unknown", "confirmed"].includes(debit.state) ||
      debit.resolution
    )
      return fail("Hold is stale or already resolved.");
    if (session.reconciliationConflict)
      return fail(
        "A contradictory debit requires separate manual investigation.",
      );
    if (
      (debit.state === "confirmed" || debit.lateConfirmation) &&
      args.outcome !== "confirmed"
    )
      return fail("A confirmed debit cannot be resolved as denied.");
    if (!session.stopConfirmed || session.stopLease)
      return fail("Normal stop and stop lease drainage are required.");
    for (const status of [
      "processing",
      "stopping",
      "idle",
      "failed",
    ] as const) {
      const apps = await ctx.db
        .query("apps")
        .withIndex("by_computeSessionId_status", (q) =>
          q
            .eq("agent.computeSessionId", session._id)
            .eq("agent.status", status),
        )
        .take(100);
      if (apps.length === 100 || apps.some((app) => app.agent?.lease))
        return fail("Worker leases must drain before resolution.");
      if (
        apps.some(
          (app) =>
            app.agent &&
            (app.agent.status === "processing" ||
              app.agent.status === "stopping" ||
              app.agent.pending.length ||
              app.agent.delivery),
        )
      )
        return fail(
          "Old work must finish and pending messages must be failed before resolution.",
        );
    }
    await ctx.db.patch("computeDebits", debit._id, {
      resolution: {
        outcome: args.outcome,
        evidence: args.evidence,
        operator: args.operator,
        resolvedAt: Date.now(),
      },
    });
    await ctx.db.patch("computeSessions", session._id, { state: "stopped" });
    return null;
  },
});
