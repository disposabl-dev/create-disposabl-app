import { paymentsEnabled } from "@disposabl/disposabl-kit/features";
import {
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import schema from "../schema";
import { deletionPending } from "../users/deletion";
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
  if (session.state === "starting" && expectedDebit) return null;
  if (session.state === "active") {
    if (!expectedDebit || session.paidUntil <= 0) return null;
    if (session.paidUntil > Date.now()) return null;
  }
  if (expectedDebit) {
    const previous = await ctx.db.get("computeDebits", expectedDebit);
    if (
      previous?.state !== "confirmed" ||
      previous.sessionId !== sessionId ||
      (session.state === "active" && previous.paidUntil !== session.paidUntil)
    )
      return null;
  }
  const latest = await ctx.db
    .query("computeSessions")
    .withIndex("by_userId", (q) => q.eq("userId", session.userId))
    .order("desc")
    .first();
  if (
    latest?._id !== sessionId ||
    session.reconciliationConflict ||
    session.untrackedConflicts ||
    session.stopConfirmed ||
    session.stopLease
  )
    return null;
  if (await deletionPending(ctx, session.userId)) {
    await ctx.db.patch("computeSessions", sessionId, { state: "stopping" });
    await ctx.scheduler.runAfter(0, internal.agent.actions.compute.stop, {
      sessionId,
    });
    return null;
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
    // A window is granted only when this debit is confirmed.
    paidUntil: 0,
  });
  await ctx.db.patch("computeSessions", sessionId, {
    debitId,
    ...(session.state === "active" ? { state: "renewing" as const } : {}),
  });
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
    if (!debit) return null;
    if (
      responseBalance !== undefined &&
      (!Number.isFinite(responseBalance) || outcome !== "confirmed")
    )
      throw new Error("Invalid debit response balance.");
    const session = await ctx.db.get("computeSessions", debit.sessionId);
    const current =
      session &&
      (await ctx.db
        .query("computeSessions")
        .withIndex("by_userId", (q) => q.eq("userId", session.userId))
        .order("desc")
        .first());
    const superseded = !session || session.debitId !== debitId;
    const displacedDispatch =
      debit.state === "dispatching" && current?._id !== session?._id;
    if (debit.state !== "dispatching" || superseded || displacedDispatch) {
      if (
        outcome !== "confirmed" ||
        debit.state === "confirmed" ||
        debit.lateConfirmation
      )
        return null;
      const conflict =
        superseded ||
        displacedDispatch ||
        debit.state === "denied" ||
        debit.resolution?.outcome === "denied" ||
        Boolean(
          current &&
          current._id !== session?._id &&
          debit.resolution?.outcome !== "confirmed",
        );
      await ctx.db.patch("computeDebits", debitId, {
        lateConfirmation: {
          observedAt: Date.now(),
          ...(responseBalance !== undefined ? { responseBalance } : {}),
        },
        ...(conflict ? { reconciliationConflict: true } : {}),
      });
      if (conflict || !debit.resolution) {
        if (current) {
          const existing = current.conflictDebits ?? [];
          // A flagged hold without recorded conflicts cannot become recoverable
          // merely because another conflict was subsequently recorded.
          const untracked =
            current.untrackedConflicts ||
            (current.reconciliationConflict && !current.conflictDebits?.length);
          const overflow = conflict && existing.length >= 100;
          await ctx.db.patch("computeSessions", current._id, {
            state: "hold",
            ...(conflict
              ? {
                  reconciliationConflict: true,
                  conflictDebits: overflow ? existing : [...existing, debitId],
                  ...(untracked || overflow
                    ? { untrackedConflicts: true }
                    : {}),
                }
              : {}),
          });
          if (!current.stopConfirmed)
            await ctx.scheduler.runAfter(
              0,
              internal.agent.actions.compute.stop,
              { sessionId: current._id },
            );
        }
      }
      return null;
    }
    if (!session || session.debitId !== debitId) return null;
    const now = Date.now();
    const funding =
      session.state === "starting" || session.state === "renewing";
    const activateFunding =
      outcome === "confirmed" &&
      funding &&
      (session.state === "renewing" || session.paidUntil === 0) &&
      !session.reconciliationConflict &&
      !session.untrackedConflicts &&
      !session.stopConfirmed &&
      !session.stopLease &&
      now < debit._creationTime + 60_000 &&
      current?._id === session._id &&
      !(await deletionPending(ctx, session.userId));
    const paidUntil = activateFunding ? now + WINDOW_MS : debit.paidUntil;
    await ctx.db.patch("computeDebits", debitId, {
      state: outcome,
      ...(activateFunding ? { paidUntil } : {}),
      ...(responseBalance !== undefined ? { responseBalance } : {}),
    });
    if (outcome === "confirmed" && activateFunding) {
      await ctx.db.patch("computeSessions", session._id, {
        state: "active",
        paidUntil,
      });
      await ctx.scheduler.runAt(paidUntil, internal.agent.compute.boundary, {
        sessionId: session._id,
        expectedDebit: debitId,
      });
      await ctx.scheduler.runAfter(0, internal.agent.actions.compute.notice, {
        debitId,
        attempt: 0,
      });
    } else {
      await ctx.db.patch("computeSessions", session._id, {
        state:
          outcome !== "denied" || session.reconciliationConflict
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

// The observation is separate from the raw debit response; queueing rechecks the window.
const noticeObservation = v.object({
  userId: v.id("users"),
  paidUntil: v.number(),
  balance: v.number(),
  observedAt: v.number(),
});

async function noticeEligibility(
  ctx: Pick<QueryCtx, "db">,
  debitId: Id<"computeDebits">,
  now: number,
) {
  const debit = await ctx.db.get("computeDebits", debitId);
  if (
    !debit ||
    debit.state !== "confirmed" ||
    debit.noticeComplete ||
    debit.noticeOutcome
  )
    return { debit, terminal: null } as const;
  if (debit.paidUntil <= now) return { debit, terminal: "expired" } as const;
  const session = await ctx.db.get("computeSessions", debit.sessionId);
  if (
    !session ||
    session.state !== "active" ||
    session.debitId !== debitId ||
    session.paidUntil !== debit.paidUntil
  )
    return { debit, terminal: "superseded" } as const;
  const userId = ctx.db.normalizeId("users", session.userId);
  if (!userId) return { debit, terminal: "invalid_user" } as const;
  const user = await ctx.db.get("users", userId);
  if (!user || user.deletionRequestedAt !== undefined)
    return { debit, terminal: "account_ineligible" } as const;
  return { debit, terminal: null, userId } as const;
}

export const noticeCandidate = internalQuery({
  args: { debitId: v.id("computeDebits"), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({ userId: v.id("users"), paidUntil: v.number() }),
  ),
  handler: async (ctx, { debitId, now }) => {
    const result = await noticeEligibility(ctx, debitId, now);
    return result.debit && "userId" in result && result.userId
      ? { userId: result.userId, paidUntil: result.debit.paidUntil }
      : null;
  },
});

// Terminal outcomes and any queue insertion commit in the same transaction.
export const notice = internalMutation({
  args: {
    debitId: v.id("computeDebits"),
    observation: v.optional(noticeObservation),
    disabled: v.optional(v.boolean()),
    failed: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { debitId, observation, disabled, failed }) => {
    const now = Date.now();
    const result = await noticeEligibility(ctx, debitId, now);
    if (!result.debit || (result.terminal === null && !("userId" in result)))
      return null;
    let outcome: NonNullable<Doc<"computeDebits">["noticeOutcome"]>;
    if (result.terminal) outcome = result.terminal;
    else if (disabled) outcome = "disabled";
    else if (failed) {
      // An exhausted observer must not suppress another observation in flight.
      // At the deadline this mutation records expiry, unless a notice won first.
      await ctx.scheduler.runAt(
        result.debit.paidUntil,
        internal.agent.compute.notice,
        { debitId, failed: true },
      );
      return null;
    } else {
      if (!observation) return null;
      if (
        observation.userId !== result.userId ||
        observation.paidUntil !== result.debit.paidUntil ||
        !Number.isFinite(observation.balance) ||
        !Number.isSafeInteger(observation.observedAt) ||
        observation.observedAt <= 0 ||
        observation.observedAt > now
      )
        throw new Error("Invalid notice observation.");
      outcome = await ctx.runMutation(internal.product.lowCreditEmail.queue, {
        userId: observation.userId,
        windowId: debitId,
        paidUntil: observation.paidUntil,
        balance: observation.balance,
      });
    }
    await ctx.db.patch("computeDebits", debitId, {
      noticeOutcome: outcome,
      ...(observation && !result.terminal && !disabled && !failed
        ? {
            noticeBalance: observation.balance,
            noticeObservedAt: observation.observedAt,
          }
        : {}),
    });
    return null;
  },
});
