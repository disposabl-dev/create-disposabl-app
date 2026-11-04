import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";

export const status = v.union(
  v.literal("idle"),
  v.literal("processing"),
  v.literal("stopping"),
  v.literal("failed"),
);
export const sendArgs = { prompt: v.string(), appId: v.optional(v.string()) };
export const historyArgs = {
  appId: v.optional(v.string()),
  paginationOpts: v.optional(paginationOptsValidator),
};
export const result = v.object({
  appId: v.string(),
  threadId: v.string(),
  status,
});
export const threadFields = {
  userId: v.string(),
  appId: v.string(),
  threadId: v.string(),
  status,
  pending: v.array(v.string()),
  updatedAt: v.number(),
  conversationId: v.optional(v.string()),
  promptId: v.optional(v.string()),
  cursor: v.optional(v.string()),
  error: v.optional(v.string()),
  stopFailures: v.optional(v.number()),
  stopUnconfirmed: v.optional(v.boolean()),
  delivery: v.optional(v.string()),
  lease: v.optional(
    v.object({
      token: v.string(),
      expiresAt: v.number(),
      watchdog: v.id("_scheduled_functions"),
    }),
  ),
};
export const thread = v.object({
  ...threadFields,
  _id: v.id("agentThreads"),
  _creationTime: v.number(),
});
export const message = v.object({
  id: v.string(),
  role: v.string(),
  content: v.string(),
  status: v.string(),
  createdAt: v.number(),
  tools: v.optional(v.string()),
});
export const history = v.union(
  v.object({
    kind: v.literal("messages"),
    ...result.fields,
    error: v.optional(v.string()),
    ...paginationResultValidator(message).fields,
  }),
  v.object({
    kind: v.literal("threads"),
    ...paginationResultValidator(
      v.object({
        ...result.fields,
        name: v.string(),
        updatedAt: v.number(),
        error: v.optional(v.string()),
      }),
    ).fields,
  }),
);
export const event = v.object({
  id: v.string(),
  content: v.string(),
  streaming: v.boolean(),
  reverted: v.boolean(),
  taskId: v.optional(v.string()),
  tools: v.optional(v.string()),
});
export const eventFields = {
  agentThreadId: v.id("agentThreads"),
  eventId: v.string(),
  closed: v.optional(v.boolean()),
  messageId: v.string(),
  streaming: v.boolean(),
  taskId: v.optional(v.string()),
  tools: v.optional(v.string()),
};
export const workerArgs = { id: v.id("agentThreads"), token: v.string() };
