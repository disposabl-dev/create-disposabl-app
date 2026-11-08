import { paymentsEnabled } from "@disposabl/disposabl-kit/features";
import {
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import schema from "../schema";
import { computeSessionArgs } from "./computeValidator";

export const WINDOW_MS = 600_000;

/** Called inside enqueue's transaction, after validating the request. */
export async function admitSession(
  ctx: MutationCtx,
  userId: string,
  enabled = paymentsEnabled,
) {
  if (!enabled) return undefined;
  const current = await ctx.db
    .query("computeSessions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  if (current && current.state !== "stopped") {
    if (
      current.state === "starting" ||
      (current.state === "active" && current.paidUntil > Date.now())
    )
      return current._id;
    throw new ConvexError({
      code: "compute_unavailable",
      message:
        current.state === "hold"
          ? "A credit charge needs reconciliation. Please contact support."
          : "Your sandbox is stopping. Send a new message after it stops.",
    });
  }
  return ctx.db.insert("computeSessions", {
    userId,
    state: "starting",
    paidUntil: 0,
  });
}

export async function sessionAllows(
  ctx: QueryCtx,
  sessionId: Id<"computeSessions"> | undefined,
  userId: string,
  now: number,
  enabled = paymentsEnabled,
) {
  if (!enabled) return true;
  const session = sessionId
    ? await ctx.db.get("computeSessions", sessionId)
    : null;
  return Boolean(
    session &&
    session.userId === userId &&
    session.state === "active" &&
    session.paidUntil > now,
  );
}

export const get = internalQuery({
  args: computeSessionArgs,
  returns: v.union(schema.doc("computeSessions"), v.null()),
  handler: (ctx, { sessionId }) => ctx.db.get("computeSessions", sessionId),
});

/** The transaction persists the sole dispatch claim BEFORE contacting Autumn. */
export const claim = internalMutation({
  args: {
    ...computeSessionArgs,
    expectedDebit: v.optional(v.id("computeDebits")),
  },
  returns: v.union(schema.doc("computeDebits"), v.null()),
  handler: (ctx, args) => claimWindow(ctx, args),
});

export async function claimWindow(
  ctx: MutationCtx,
  {
    sessionId,
    expectedDebit,
  }: { sessionId: Id<"computeSessions">; expectedDebit?: Id<"computeDebits"> },
  enabled = paymentsEnabled,
) {
  if (!enabled) return null;
  const session = await ctx.db.get("computeSessions", sessionId);
  if (!session || !["starting", "active"].includes(session.state)) return null;
  if (session.debitId !== expectedDebit) return null;
  if (session.state === "active") {
    if (session.paidUntil > Date.now()) return null;
    // A debit dispatched after expiry cannot prove the balance existed at the deadline.
    await ctx.db.patch("computeSessions", sessionId, { state: "stopping" });
    await ctx.scheduler.runAfter(0, internal.agent.actions.compute.stop, {
      sessionId,
    });
    return null;
  }
  if (expectedDebit) {
    const previous = await ctx.db.get("computeDebits", expectedDebit);
    if (previous?.state !== "confirmed") return null;
  }
  const active = await ctx.db
    .query("apps")
    .withIndex("by_computeSessionId_status", (q) =>
      q
        .eq("agent.computeSessionId", sessionId)
        .eq("agent.status", "processing"),
    )
    .first();
  if (!active) {
    await ctx.db.patch("computeSessions", sessionId, { state: "stopping" });
    await ctx.scheduler.runAfter(0, internal.agent.actions.compute.stop, {
      sessionId,
    });
    return null;
  }
  const debitId = await ctx.db.insert("computeDebits", {
    sessionId,
    state: "dispatching",
    paidUntil: Date.now() + WINDOW_MS,
  });
  await ctx.db.patch("computeSessions", sessionId, { debitId });
  await ctx.scheduler.runAfter(60_000, internal.agent.compute.uncertain, {
    debitId,
  });
  return ctx.db.get("computeDebits", debitId);
}

export const settle = internalMutation({
  args: {
    debitId: v.id("computeDebits"),
    responseBalance: v.optional(v.number()),
    outcome: v.union(
      v.literal("confirmed"),
      v.literal("denied"),
      v.literal("unknown"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { debitId, outcome, responseBalance }) => {
    const debit = await ctx.db.get("computeDebits", debitId);
    if (!debit || debit.state !== "dispatching") return null;
    const session = await ctx.db.get("computeSessions", debit.sessionId);
    if (!session || session.debitId !== debitId) return null;
    if (
      responseBalance !== undefined &&
      (!Number.isFinite(responseBalance) || outcome !== "confirmed")
    )
      throw new Error("Invalid debit response balance.");
    await ctx.db.patch("computeDebits", debitId, {
      state: outcome,
      ...(responseBalance !== undefined ? { responseBalance } : {}),
    });
    if (
      outcome === "confirmed" &&
      ["starting", "active"].includes(session.state) &&
      (session.state === "starting" || session.paidUntil > Date.now()) &&
      debit.paidUntil > Date.now()
    ) {
      await ctx.db.patch("computeSessions", session._id, {
        state: "active",
        paidUntil: debit.paidUntil,
      });
      await ctx.scheduler.runAt(
        debit.paidUntil,
        internal.agent.compute.boundary,
        { sessionId: session._id, expectedDebit: debitId },
      );
      await ctx.scheduler.runAfter(0, internal.agent.actions.compute.notice, {
        debitId,
        attempt: 0,
      });
    } else {
      await ctx.db.patch("computeSessions", session._id, {
        state:
          outcome !== "denied"
            ? "hold"
            : session.stopConfirmed
              ? "stopped"
              : "stopping",
      });
      await ctx.scheduler.runAfter(0, internal.agent.actions.compute.stop, {
        sessionId: session._id,
      });
    }
    return null;
  },
});

export const uncertain = internalMutation({
  args: { debitId: v.id("computeDebits") },
  returns: v.null(),
  handler: async (ctx, { debitId }) => {
    await ctx.runMutation(internal.agent.compute.settle, {
      debitId,
      outcome: "unknown",
    });
    return null;
  },
});

/** Mutations retry transactionally; a lost action before its debit claim is recoverable. */
export const boundary = internalMutation({
  args: { ...computeSessionArgs, expectedDebit: v.id("computeDebits") },
  returns: v.null(),
  handler: (ctx, args) => scheduleBoundary(ctx, args),
});

export async function scheduleBoundary(
  ctx: MutationCtx,
  args: {
    sessionId: Id<"computeSessions">;
    expectedDebit: Id<"computeDebits">;
  },
  enabled = paymentsEnabled,
) {
  if (!enabled) return null;
  const session = await ctx.db.get("computeSessions", args.sessionId);
  if (
    !session ||
    session.state !== "active" ||
    session.debitId !== args.expectedDebit
  )
    return null;
  await ctx.scheduler.runAfter(0, internal.agent.actions.compute.renew, args);
  await ctx.scheduler.runAfter(30_000, internal.agent.compute.boundary, args);
  return null;
}

/** A stop remains fenced until every old action lease has drained. */
export const stopping = internalMutation({
  args: { ...computeSessionArgs, token: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { sessionId, token }) => {
    const session = await ctx.db.get("computeSessions", sessionId);
    if (
      !session ||
      !["stopping", "hold"].includes(session.state) ||
      session.stopConfirmed
    )
      return false;
    if (session.stopLease && session.stopLease.until > Date.now()) return false;
    // Longer than Convex's ten-minute action limit: an old action cannot outlive this lease.
    const until = Date.now() + 11 * 60_000;
    await ctx.db.patch("computeSessions", sessionId, {
      stopLease: { token, until },
    });
    await ctx.scheduler.runAt(until, internal.agent.actions.compute.stop, {
      sessionId,
    });
    return true;
  },
});

export const stopped = internalMutation({
  args: { ...computeSessionArgs, token: v.string(), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { sessionId, token, archived }) => {
    const session = await ctx.db.get("computeSessions", sessionId);
    if (
      !session ||
      session.stopLease?.token !== token ||
      !["stopping", "hold"].includes(session.state)
    )
      return null;
    await ctx.db.patch("computeSessions", sessionId, { stopLease: undefined });
    await ctx.scheduler.runAfter(30_000, internal.agent.actions.compute.stop, {
      sessionId,
    });
    if (!archived) return null;
    for (const status of ["processing", "stopping"] as const) {
      const apps = await ctx.db
        .query("apps")
        .withIndex("by_computeSessionId_status", (q) =>
          q.eq("agent.computeSessionId", sessionId).eq("agent.status", status),
        )
        .take(100);
      if (apps.length === 100 || apps.some((app) => app.agent?.lease))
        return null;
    }
    const debit = session.debitId
      ? await ctx.db.get("computeDebits", session.debitId)
      : null;
    await ctx.db.patch("computeSessions", sessionId, {
      state:
        session.state === "hold" || debit?.state === "dispatching"
          ? "hold"
          : "stopped",
      stopConfirmed: true,
    });
    return null;
  },
});

export const getDebit = internalQuery({
  args: { debitId: v.id("computeDebits") },
  returns: v.union(schema.doc("computeDebits"), v.null()),
  handler: (ctx, { debitId }) => ctx.db.get("computeDebits", debitId),
});

// Terminal outcomes are recorded atomically with enqueue; failed enqueues roll back.
export const notice = internalMutation({
  args: { debitId: v.id("computeDebits"), failed: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { debitId, failed }) => {
    const debit = await ctx.db.get("computeDebits", debitId);
    if (
      !debit ||
      debit.state !== "confirmed" ||
      debit.noticeComplete ||
      debit.noticeOutcome
    )
      return null;
    const session = await ctx.db.get("computeSessions", debit.sessionId);
    const userId = session && ctx.db.normalizeId("users", session.userId);
    const outcome =
      debit.paidUntil <= Date.now()
        ? "expired"
        : failed
          ? "failed"
          : !userId
            ? "invalid_user"
            : debit.responseBalance === undefined
              ? "missing_balance"
              : await ctx.runMutation(internal.product.lowCreditEmail.queue, {
                  userId,
                  windowId: debitId,
                  paidUntil: debit.paidUntil,
                  balance: debit.responseBalance,
                });
    await ctx.db.patch("computeDebits", debitId, { noticeOutcome: outcome });
    return null;
  },
});
