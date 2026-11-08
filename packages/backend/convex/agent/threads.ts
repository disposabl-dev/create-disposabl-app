import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { execution, thread } from "./validator";

type Thread = Infer<typeof thread>;

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
  await ctx.db.patch("apps", app._id, { agent: { ...state, ...patch } });
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
