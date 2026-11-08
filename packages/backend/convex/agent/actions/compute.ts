import { paymentsEnabled } from "@disposabl/disposabl-kit/features";
import { internalAction } from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import { env, type ActionCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { boat, sandboxRef } from "../boat";
import { debitCompute } from "../computeDebit";
import { computeSessionArgs } from "../computeValidator";

export async function fund(
  ctx: ActionCtx,
  sessionId: Id<"computeSessions">,
  expectedDebit?: Id<"computeDebits">,
  performDebit = (userId: string) =>
    debitCompute(userId, paymentsEnabled, env.AUTUMN_SECRET_KEY),
) {
  const debit: Doc<"computeDebits"> | null = await ctx.runMutation(
    internal.agent.compute.claim,
    { sessionId, expectedDebit },
  );
  if (!debit) return;
  const session = await ctx.runQuery(internal.agent.compute.get, { sessionId });
  if (!session) return;
  const outcome = await performDebit(session.userId);
  await ctx.runMutation(internal.agent.compute.settle, {
    debitId: debit._id,
    outcome: outcome.outcome === "disabled" ? "unknown" : outcome.outcome,
    ...(outcome.outcome === "confirmed"
      ? { responseBalance: outcome.responseBalance }
      : {}),
  });
}

export const renew = internalAction({
  args: { ...computeSessionArgs, expectedDebit: v.id("computeDebits") },
  returns: v.null(),
  handler: async (ctx, { sessionId, expectedDebit }) => {
    await fund(ctx, sessionId, expectedDebit);
    return null;
  },
});

/** Only queued user work may start a session. Timers cannot create a new one. */
export async function computeAccess(
  ctx: ActionCtx,
  userId: string,
  sessionId?: Id<"computeSessions">,
): Promise<"ready" | "waiting" | "blocked"> {
  if (await ctx.runQuery(internal.users.internal.deletionPending, { userId }))
    return "blocked";
  if (!paymentsEnabled) return "ready";
  if (!sessionId) return "blocked";
  let session = await ctx.runQuery(internal.agent.compute.get, { sessionId });
  if (!session || session.userId !== userId) return "blocked";
  if (session.state === "starting" && !session.debitId) {
    await fund(ctx, sessionId);
    session = await ctx.runQuery(internal.agent.compute.get, { sessionId });
  }
  if (!session || !["starting", "active"].includes(session.state))
    return "blocked";
  return session.state === "active" && session.paidUntil > Date.now()
    ? "ready"
    : "waiting";
}

/** Never force: Boat's normal stop snapshots disk; failure remains fenced. */
export const stop = internalAction({
  args: computeSessionArgs,
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const token = crypto.randomUUID();
    if (
      !(await ctx.runMutation(internal.agent.compute.stopping, {
        sessionId,
        token,
      }))
    )
      return null;
    const session = await ctx.runQuery(internal.agent.compute.get, {
      sessionId,
    });
    if (!session) return null;
    const ref = sandboxRef(session.userId);
    let archived = false;
    try {
      let sandbox = await ctx.runQuery(components.boat.sandboxes.get, ref);
      if (sandbox?.sandboxId) {
        sandbox = await boat.refresh(ctx, ref);
        if (sandbox.state !== "archived") sandbox = await boat.stop(ctx, ref);
        if (sandbox.state !== "archived") return null;
      }
      archived = true;
    } catch {
      // Recovery was scheduled before the call. Never infer a successful snapshot.
      console.error("compute_stop_unconfirmed");
    } finally {
      await ctx.runMutation(internal.agent.compute.stopped, {
        sessionId,
        token,
        archived,
      });
    }
    return null;
  },
});

/** Retries only queue failures, at most five times and only within the paid window. */
export async function deliverNotice(
  ctx: ActionCtx,
  debitId: Id<"computeDebits">,
  attempt: number,
) {
  const debit = await ctx.runQuery(internal.agent.compute.getDebit, {
    debitId,
  });
  if (
    !debit ||
    debit.state !== "confirmed" ||
    debit.noticeComplete ||
    debit.noticeOutcome
  )
    return null;
  try {
    await ctx.runMutation(internal.agent.compute.notice, { debitId });
  } catch {
    if (attempt < 5 && debit.paidUntil > Date.now())
      await ctx.scheduler.runAfter(
        30_000,
        internal.agent.actions.compute.notice,
        { debitId, attempt: attempt + 1 },
      );
    else
      await ctx.runMutation(internal.agent.compute.notice, {
        debitId,
        failed: true,
      });
  }
  return null;
}

export const notice = internalAction({
  args: { debitId: v.id("computeDebits"), attempt: v.number() },
  returns: v.null(),
  handler: (ctx, { debitId, attempt }) => deliverNotice(ctx, debitId, attempt),
});

/** Explicit operator retry; unknown stays pending until a confirmed archived response. */
export const stopForDeletion = internalAction({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const token = crypto.randomUUID();
    if (
      !(await ctx.runMutation(internal.users.internal.claimDeletionStop, {
        userId,
        token,
      }))
    )
      return null;
    let outcome: "unknown" | "archived_observed" = "unknown";
    try {
      const ref = sandboxRef(userId);
      const sandbox = await ctx.runQuery(components.boat.sandboxes.get, ref);
      if (sandbox?.sandboxId) {
        const refreshed = await boat.refresh(ctx, ref);
        const stopped =
          refreshed.state === "archived"
            ? refreshed
            : await boat.stop(ctx, ref);
        if (stopped.state === "archived") outcome = "archived_observed";
      }
    } catch {
      // A lost response cannot establish that the sandbox stopped.
    }
    await ctx.runMutation(internal.users.internal.finishDeletionStop, {
      userId,
      token,
      outcome,
    });
    return null;
  },
});
