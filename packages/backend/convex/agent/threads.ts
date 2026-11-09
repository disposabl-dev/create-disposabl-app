import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { execution, thread } from "./validator";

type Thread = Infer<typeof thread>;

export function legacyCompleted(current: Infer<typeof execution>) {
  return Boolean(
    current.turnCompleted === undefined &&
    current.status === "idle" &&
    current.promptId &&
    current.startedAt &&
    current.finishedAt &&
    current.finishedAt >= current.startedAt &&
    !current.lease &&
    !current.pending.length &&
    !current.delivery &&
    !current.error &&
    !current.stopUnconfirmed,
  );
}

export function remoteUnresolved(agent: Infer<typeof execution> | undefined) {
  if (!agent) return false;
  const completed = legacyCompleted(agent);
  return Boolean(
    agent.delivery ||
    agent.stopUnconfirmed ||
    (agent.promptId && !completed) ||
    (agent.conversationId && !agent.turnCompleted && !completed),
  );
}

export function resumeBusy(
  agent: Infer<typeof execution> | undefined,
  now: number,
) {
  return (
    remoteUnresolved(agent) ||
    Boolean(agent?.lease && agent.lease.expiresAt > now)
  );
}

/** Normalize old rows in committed batches; expire lease-only classifications lazily. */
export async function classifyResumeSafety(
  ctx: MutationCtx,
  userId: string,
  sessionId: Id<"computeSessions">,
  worker?: { id: string; token: string },
) {
  const now = Date.now();
  const missing = await ctx.db
    .query("apps")
    .withIndex("by_userId_resumeBusy_session", (q) =>
      q.eq("userId", userId).eq("agentResumeBusy", undefined),
    )
    .take(50);
  for (const app of missing)
    await ctx.db.patch("apps", app._id, {
      agentResumeBusy: resumeBusy(app.agent, now),
    });
  const pending = await ctx.db
    .query("apps")
    .withIndex("by_userId_resumeBusy_session", (q) =>
      q.eq("userId", userId).eq("agentResumeBusy", undefined),
    )
    .first();
  if (pending) return "wait" as const;
  const isOtherWorker = (app: Doc<"apps">) =>
    !worker ||
    app.agent?.threadId !== worker.id ||
    app.agent?.lease?.token !== worker.token ||
    app.agent?.computeSessionId !== sessionId;
  // Read the actual lease too: an in-flight pre-deployment mutation may not
  // maintain the derived classification introduced by this deployment.
  const leased = await ctx.db
    .query("apps")
    .withIndex("by_userId_agentLeaseUntil", (q) =>
      q.eq("userId", userId).gt("agent.lease.expiresAt", now),
    )
    .take(2);
  if (leased.some(isOtherWorker)) return "wait" as const;
  // Only this exact action lease is exempt. Another worker in the same paid
  // session can still be running pre-deployment code without activation fencing.
  // Two rows suffice: at most one can own the unique thread/token pair.
  const busy = await ctx.db
    .query("apps")
    .withIndex("by_userId_resumeBusy_session", (q) =>
      q.eq("userId", userId).eq("agentResumeBusy", true),
    )
    .take(2);
  const other = busy.find(isOtherWorker);
  if (!other) return "ready" as const;
  if (remoteUnresolved(other.agent)) return "blocked" as const;
  if (!resumeBusy(other.agent, now)) {
    await ctx.db.patch("apps", other._id, { agentResumeBusy: false });
    return "wait" as const;
  }
  return "wait" as const;
}

/** Call again when pending is true; never throw after writing a batch. */
export async function normalizeRemoteWork(ctx: MutationCtx, userId: string) {
  const missing = await ctx.db
    .query("apps")
    .withIndex("by_userId_agentRemoteUnresolved", (q) =>
      q.eq("userId", userId).eq("agentRemoteUnresolved", undefined),
    )
    .take(50);
  for (const app of missing)
    await ctx.db.patch("apps", app._id, {
      agentRemoteUnresolved: remoteUnresolved(app.agent),
    });
  const pending = await ctx.db
    .query("apps")
    .withIndex("by_userId_agentRemoteUnresolved", (q) =>
      q.eq("userId", userId).eq("agentRemoteUnresolved", undefined),
    )
    .first();
  const unresolved = await ctx.db
    .query("apps")
    .withIndex("by_userId_agentRemoteUnresolved", (q) =>
      q.eq("userId", userId).eq("agentRemoteUnresolved", true),
    )
    .first();
  return { pending: Boolean(pending), unresolved: Boolean(unresolved) };
}

/** Every app shares this user's machine, including any suspended remote work. */
export async function hasUnconfirmedRuns(ctx: QueryCtx, userId: string) {
  const unresolved = await ctx.db
    .query("apps")
    .withIndex("by_userId_stopUnconfirmed", (q) =>
      q.eq("userId", userId).eq("agent.stopUnconfirmed", true),
    )
    .first();
  return Boolean(unresolved);
}

export async function assertNoUnconfirmedRuns(ctx: QueryCtx, userId: string) {
  if (await hasUnconfirmedRuns(ctx, userId))
    throw new ConvexError(
      "A previous remote run has not been confirmed stopped. Reconcile it before starting more sandbox work.",
    );
}

export function readThread(app: Doc<"apps"> | null): Thread | null {
  return app?.agent
    ? { ...app.agent, appId: app.appId, userId: app.userId }
    : null;
}

export async function getThread(ctx: QueryCtx, threadId: string) {
  return readThread(
    await ctx.db
      .query("apps")
      .withIndex("by_threadId", (q) => q.eq("agent.threadId", threadId))
      .unique(),
  );
}

/** Keep queue updates and lease checks in the same transaction. */
export async function patchThread(
  ctx: MutationCtx,
  current: Thread,
  patch: Partial<Infer<typeof execution>>,
) {
  const app = await ctx.db
    .query("apps")
    .withIndex("by_appId", (q) => q.eq("appId", current.appId))
    .unique();
  if (!app) throw new Error("Agent app no longer exists.");
  const { appId: _appId, userId: _userId, ...state } = current;
  const agent = { ...state, ...patch };
  await ctx.db.patch("apps", app._id, {
    agent,
    agentRemoteUnresolved: remoteUnresolved(agent),
    agentResumeBusy: resumeBusy(agent, Date.now()),
  });
}

/** Old workers and queued messages must finish before a different paid session binds. */
export function assertSessionRebind(
  current: Thread,
  next: Id<"computeSessions"> | undefined,
) {
  if (current.computeSessionId === next) return;
  if (
    current.lease ||
    current.pending.length ||
    current.delivery ||
    current.status === "processing" ||
    current.status === "stopping"
  )
    throw new ConvexError(
      "Previous sandbox work is still stopping. Try again after it finishes.",
    );
}
