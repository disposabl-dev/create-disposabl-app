import { deletionPending } from "../users/deletion";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { getThread, patchThread } from "./threads";
import { workerArgs } from "./validator";
import { sessionAllows } from "./compute";

export const accessPrefix = "disposabl_agent_";
export async function digest(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Only the leased worker can authorize its next remote turn. Store no bearer. */
export const issue = internalMutation({
  args: {
    ...workerArgs,
    userId: v.string(),
    appId: v.string(),
    hash: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, { id, token, userId, appId, hash }) => {
    const current = await getThread(ctx, id);
    if (
      !current ||
      current.userId !== userId ||
      current.appId !== appId ||
      (await deletionPending(ctx, current.userId)) ||
      !(await sessionAllows(
        ctx,
        current.computeSessionId,
        current.userId,
        Date.now(),
      )) ||
      current.status !== "processing" ||
      current.stopUnconfirmed ||
      current.lease?.token !== token ||
      current.lease.expiresAt <= Date.now() ||
      !/^[a-f0-9]{64}$/.test(hash)
    )
      throw new Error("Agent authorization requires an active worker lease.");
    const expiresAt = Date.now() + 4 * 60 * 60_000;
    await patchThread(ctx, current, { access: { hash, expiresAt } });
    return expiresAt;
  },
});

export const authenticate = internalQuery({
  args: { hash: v.string() },
  returns: v.union(
    v.null(),
    v.object({ userId: v.string(), appId: v.string(), threadId: v.string() }),
  ),
  handler: async (ctx, { hash }) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_agentAccessHash", (q) => q.eq("agent.access.hash", hash))
      .unique();
    if (
      !app?.agent?.access ||
      (await deletionPending(ctx, app.userId)) ||
      !(await sessionAllows(
        ctx,
        app.agent.computeSessionId,
        app.userId,
        Date.now(),
      )) ||
      app.agent.status !== "processing" ||
      app.agent.stopUnconfirmed ||
      app.agent.access.expiresAt <= Date.now() ||
      app.operation?.kind === "delete"
    )
      return null;
    return {
      userId: app.userId,
      appId: app.appId,
      threadId: app.agent.threadId,
    };
  },
});
