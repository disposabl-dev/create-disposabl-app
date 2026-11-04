import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { boat, object, sandboxRef } from "./boat";
import { event, thread, workerArgs } from "./validator";

export async function syncResponses(
  ctx: ActionCtx,
  current: Infer<typeof thread>,
  lease: { [K in keyof typeof workerArgs]: Infer<(typeof workerArgs)[K]> },
) {
  if (!current.conversationId) return { more: false, mutable: false };
  const page = await boat.events(ctx, {
    ...sandboxRef(current.userId),
    conversation: current.conversationId,
    cursor: current.cursor,
    limit: 50,
  });
  const events: Infer<typeof event>[] = [];
  for (const value of page.events) {
    const e = object(value),
      data = object(e.data);
    if (e.type !== "response" || typeof e.id !== "string") continue;
    if (
      typeof e.conversationId === "string" &&
      e.conversationId !== current.conversationId
    )
      continue;
    const content = typeof data.content === "string" ? data.content : "";
    const tools =
      Array.isArray(data.tools) && data.tools.length
        ? JSON.stringify(data.tools)
        : undefined;
    if (content.length > 200_000 || (tools?.length ?? 0) > 100_000)
      throw new Error("Agent response exceeded the storage limit.");
    events.push({
      id: e.id,
      content,
      streaming: data.is_streaming === true,
      reverted: data.is_reverted === true,
      ...(typeof e.taskId === "string" ? { taskId: e.taskId } : {}),
      ...(tools ? { tools } : {}),
    });
  }
  // Boat partials are mutable snapshots. Replay their page until final; IDs
  // upsert the same component message across retries and reconnects.
  const mutable = await ctx.runMutation(internal.agent.state.append, {
    ...lease,
    events,
    ...(page.nextCursor ? { cursor: page.nextCursor } : {}),
  });
  return { more: Boolean(page.nextCursor && !mutable), mutable };
}
