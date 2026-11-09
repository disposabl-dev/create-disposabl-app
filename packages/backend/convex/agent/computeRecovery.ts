import {
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import schema from "../schema";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

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

async function requireDrained(
  ctx: MutationCtx,
  sessionId: Id<"computeSessions">,
) {
  const fail = (message: string): never => {
    throw new ConvexError(message);
  };
  for (const status of ["processing", "stopping", "idle", "failed"] as const) {
    const apps = await ctx.db
      .query("apps")
      .withIndex("by_computeSessionId_status", (q) =>
        q.eq("agent.computeSessionId", sessionId).eq("agent.status", status),
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
}

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
    await requireDrained(ctx, session._id);
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

/** Resolve every recorded conflict against the latest, fully stopped session. */
export const resolveConflicts = internalMutation({
  args: {
    currentSessionId: v.id("computeSessions"),
    conflicts: v.array(
      v.object({
        sessionId: v.id("computeSessions"),
        debitId: v.id("computeDebits"),
        evidence: v.string(),
      }),
    ),
    operator: v.string(),
    currentDebit: v.optional(
      v.object({
        debitId: v.id("computeDebits"),
        outcome: v.union(v.literal("confirmed"), v.literal("denied")),
        evidence: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fail = (message: string): never => {
      throw new ConvexError(message);
    };
    const valid = (value: string, max: number) =>
      Boolean(value.trim()) && value.length <= max;
    if (
      !valid(args.operator, 200) ||
      !args.conflicts.length ||
      args.conflicts.length > 100 ||
      args.conflicts.some((c) => !valid(c.evidence, 4000)) ||
      (args.currentDebit && !valid(args.currentDebit.evidence, 4000))
    )
      return fail("Operator and immutable provider evidence are required.");
    const current = await ctx.db.get("computeSessions", args.currentSessionId);
    if (!current) return fail("Current session not found.");
    const latest = await ctx.db
      .query("computeSessions")
      .withIndex("by_userId", (q) => q.eq("userId", current.userId))
      .order("desc")
      .first();
    if (
      latest?._id !== current._id ||
      current.state !== "hold" ||
      !current.reconciliationConflict
    )
      return fail("Conflict hold is stale or already resolved.");
    if (current.untrackedConflicts || !current.conflictDebits?.length)
      return fail("Untracked conflicts require investigation before recovery.");
    const requested = new Set(args.conflicts.map((c) => c.debitId));
    if (
      requested.size !== args.conflicts.length ||
      requested.size !== current.conflictDebits.length ||
      current.conflictDebits.some((id) => !requested.has(id))
    )
      return fail("Every recorded conflict must be supplied exactly once.");
    if (!current.stopConfirmed || current.stopLease)
      return fail("Normal stop and stop lease drainage are required.");
    await requireDrained(ctx, current._id);
    for (const item of args.conflicts) {
      const original = await ctx.db.get("computeSessions", item.sessionId);
      const debit = await ctx.db.get("computeDebits", item.debitId);
      if (
        !original ||
        original.userId !== current.userId ||
        !debit ||
        debit.sessionId !== original._id ||
        !debit.reconciliationConflict ||
        !debit.lateConfirmation ||
        debit.conflictResolution
      )
        return fail("Conflict session or debit does not match.");
      if (
        !original.stopConfirmed ||
        original.stopLease ||
        (original._id !== current._id && original.state !== "stopped")
      )
        return fail("Original session stop is not confirmed.");
      if (original._id !== current._id) await requireDrained(ctx, original._id);
    }
    const currentDebit =
      current.debitId && (await ctx.db.get("computeDebits", current.debitId));
    if (current.debitId && !currentDebit)
      return fail("Current debit is unavailable.");
    if (currentDebit && currentDebit.sessionId !== current._id)
      return fail("Current debit does not match the session.");
    if (currentDebit?.state === "dispatching")
      return fail("Current debit dispatch is still in flight.");
    const needsResolution =
      currentDebit &&
      !currentDebit.resolution &&
      (currentDebit.state === "unknown" ||
        (currentDebit.state === "confirmed" &&
          (currentDebit.paidUntil === 0 ||
            currentDebit.paidUntil !== current.paidUntil)));
    if (needsResolution) {
      const proof = args.currentDebit;
      if (
        !proof ||
        proof.debitId !== currentDebit._id ||
        ((currentDebit.state === "confirmed" ||
          currentDebit.lateConfirmation) &&
          proof.outcome !== "confirmed")
      )
        return fail("Current debit needs matching final evidence and outcome.");
      await ctx.db.patch("computeDebits", currentDebit._id, {
        resolution: {
          outcome: proof.outcome,
          evidence: proof.evidence,
          operator: args.operator,
          resolvedAt: Date.now(),
        },
      });
    } else if (args.currentDebit)
      return fail("Current debit does not need resolution.");
    for (const item of args.conflicts) {
      await ctx.db.patch("computeDebits", item.debitId, {
        conflictResolution: {
          evidence: item.evidence,
          operator: args.operator,
          resolvedAt: Date.now(),
        },
      });
    }
    await ctx.db.patch("computeSessions", current._id, {
      state: "stopped",
      reconciliationConflict: false,
      conflictDebits: undefined,
    });
    return null;
  },
});
