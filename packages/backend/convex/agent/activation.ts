import { internalMutation } from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { deletionPending } from "../users/deletion";
import {
  classifyResumeSafety,
  normalizeRemoteWork,
  patchThread,
  readThread,
} from "./threads";
import { workerArgs } from "./validator";
import { computeSessionArgs } from "./computeValidator";

// The claiming action itself must make the provider call; handing the token to
// a later action would invalidate this bound on the in-flight action lifetime.
const ACTION_FENCE_MS = 11 * 60_000;
async function latest(
  ctx: MutationCtx,
  userId: string,
  id: Id<"computeSessions">,
) {
  const session = await ctx.db
    .query("computeSessions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  return session?._id === id;
}
export async function closeActivation(
  ctx: MutationCtx,
  id: Id<"computeSessions">,
) {
  await ctx.db.patch("computeSessions", id, { state: "stopping" });
  await ctx.scheduler.runAfter(0, internal.agent.actions.compute.stop, {
    sessionId: id,
  });
}
/** Progress commits before waiting; durable remote uncertainty requires reconciliation. */
export async function prepareActivation(
  ctx: MutationCtx,
  userId: string,
  sessionId: Id<"computeSessions">,
  worker?: { id: string; token: string },
) {
  const work = await normalizeRemoteWork(ctx, userId);
  if (work.pending) return "wait" as const;
  if (work.unresolved) {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_userId_agentRemoteUnresolved", (q) =>
        q.eq("userId", userId).eq("agentRemoteUnresolved", true),
      )
      .first();
    const thread = readThread(app);
    if (thread)
      await patchThread(ctx, thread, {
        stopUnconfirmed: true,
        error:
          "Previous remote work needs stop confirmation before this sandbox can resume.",
      });
    await closeActivation(ctx, sessionId);
    return "blocked" as const;
  }
  return classifyResumeSafety(ctx, userId, sessionId, worker);
}
export async function claimActivation(
  ctx: MutationCtx,
  args: {
    sessionId: Id<"computeSessions">;
    token: string;
    worker?: { id: string; token: string };
  },
) {
  const session = await ctx.db.get("computeSessions", args.sessionId);
  if (
    !session ||
    session.state !== "active" ||
    session.paidUntil <= Date.now() ||
    !(await latest(ctx, session.userId, args.sessionId)) ||
    (await deletionPending(ctx, session.userId))
  )
    return "blocked" as const;
  if (session.activation === "active") return "ready" as const;
  if (
    session.activation === "claimed" &&
    session.activationLease &&
    session.activationLease.until > Date.now()
  )
    return "wait" as const;
  if (session.activation !== "fresh") {
    await closeActivation(ctx, args.sessionId);
    return "blocked" as const;
  }
  const safety = await prepareActivation(
    ctx,
    session.userId,
    args.sessionId,
    args.worker,
  );
  if (safety !== "ready") return safety;
  await ctx.db.patch("computeSessions", args.sessionId, {
    activation: "claimed",
    activationLease: { token: args.token, until: Date.now() + ACTION_FENCE_MS },
  });
  await ctx.scheduler.runAfter(
    ACTION_FENCE_MS,
    internal.agent.activation.expired,
    { sessionId: args.sessionId, token: args.token },
  );
  return "claimed" as const;
}
export async function completeActivation(
  ctx: MutationCtx,
  args: { sessionId: Id<"computeSessions">; token: string },
) {
  const session = await ctx.db.get("computeSessions", args.sessionId);
  if (
    !session ||
    session.activation !== "claimed" ||
    session.activationLease?.token !== args.token
  )
    return false;
  if (
    session.state !== "active" ||
    session.paidUntil <= Date.now() ||
    session.activationLease.until <= Date.now() ||
    !(await latest(ctx, session.userId, args.sessionId)) ||
    (await deletionPending(ctx, session.userId))
  )
    return false;
  await ctx.db.patch("computeSessions", args.sessionId, {
    activation: "active",
    activationLease: undefined,
  });
  return true;
}
export async function uncertainActivation(
  ctx: MutationCtx,
  args: { sessionId: Id<"computeSessions">; token: string },
) {
  const session = await ctx.db.get("computeSessions", args.sessionId);
  if (
    !session ||
    session.activation !== "claimed" ||
    session.activationLease?.token !== args.token
  )
    return false;
  await ctx.db.patch("computeSessions", args.sessionId, {
    activation: "uncertain",
  });
  if (
    session.state === "active" ||
    session.state === "starting" ||
    session.state === "renewing"
  )
    await closeActivation(ctx, args.sessionId);
  return true;
}
export async function archiveStop(
  ctx: MutationCtx,
  args: { sessionId: Id<"computeSessions"> },
) {
  const session = await ctx.db.get("computeSessions", args.sessionId);
  if (!session || !["active", "renewing", "starting"].includes(session.state))
    return false;
  await closeActivation(ctx, args.sessionId);
  return true;
}
export const claim = internalMutation({
  args: {
    ...computeSessionArgs,
    token: v.string(),
    worker: v.optional(v.object(workerArgs)),
  },
  returns: v.union(
    v.literal("blocked"),
    v.literal("wait"),
    v.literal("claimed"),
    v.literal("ready"),
  ),
  handler: claimActivation,
});
export const expired = internalMutation({
  args: { ...computeSessionArgs, token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("computeSessions", args.sessionId);
    if (
      session?.activation === "claimed" &&
      session.activationLease?.token === args.token &&
      session.activationLease.until <= Date.now()
    )
      await uncertainActivation(ctx, args);
    return null;
  },
});
export const complete = internalMutation({
  args: { ...computeSessionArgs, token: v.string() },
  returns: v.boolean(),
  handler: completeActivation,
});
export const uncertain = internalMutation({
  args: { ...computeSessionArgs, token: v.string() },
  returns: v.boolean(),
  handler: uncertainActivation,
});
export const archived = internalMutation({
  args: computeSessionArgs,
  returns: v.boolean(),
  handler: archiveStop,
});
