import { paymentsEnabled } from "@disposabl/disposabl-kit/features";
import { internalAction } from "@disposabl/disposabl-kit/server/lib/functions";
import {
  balanceFromCustomer,
  billingRequest,
} from "@disposabl/disposabl-kit/server/billing";
import { v } from "convex/values";
import { components, internal } from "../../_generated/api";
import { env, type ActionCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { boat, sandboxRef } from "../boat";
import { debitCompute } from "../computeDebit";
import { computeSessionArgs } from "../computeValidator";

async function fund(
  ctx: ActionCtx,
  sessionId: Id<"computeSessions">,
  expectedDebit?: Id<"computeDebits">,
) {
  const debit: Doc<"computeDebits"> | null = await ctx.runMutation(
    internal.agent.compute.claim,
    { sessionId, expectedDebit },
  );
  if (!debit) return;
  const session = await ctx.runQuery(internal.agent.compute.get, { sessionId });
  if (!session) return;
  const outcome = await debitCompute(
    session.userId,
    paymentsEnabled,
    env.AUTUMN_SECRET_KEY,
  );
  await ctx.runMutation(internal.agent.compute.settle, {
    debitId: debit._id,
    outcome: outcome === "disabled" ? "unknown" : outcome,
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

export const notice = internalAction({
  args: { debitId: v.id("computeDebits"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { debitId, attempt }) => {
    const debit = await ctx.runQuery(internal.agent.compute.getDebit, {
      debitId,
    });
    if (
      !paymentsEnabled ||
      !debit ||
      debit.state !== "confirmed" ||
      debit.noticeComplete ||
      debit.paidUntil <= Date.now()
    )
      return null;
    try {
      const session = await ctx.runQuery(internal.agent.compute.get, {
        sessionId: debit.sessionId,
      });
      if (!session || !env.AUTUMN_SECRET_KEY) return null;
      const balance = balanceFromCustomer(
        await billingRequest(env.AUTUMN_SECRET_KEY, "customers.get_or_create", {
          customer_id: session.userId,
        }),
      );
      if (balance === null) throw new Error("Balance unavailable");
      await ctx.runMutation(internal.agent.compute.notice, {
        debitId,
        balance,
      });
    } catch {
      if (attempt < 5)
        await ctx.scheduler.runAfter(
          30_000,
          internal.agent.actions.compute.notice,
          { debitId, attempt: attempt + 1 },
        );
      else console.error("compute_notice_unconfirmed");
    }
    return null;
  },
});
