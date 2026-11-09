import {
  actionGeneric as action,
  mutationGeneric as mutation,
  queryGeneric as query,
  anyApi,
} from "convex/server";
import { v } from "convex/values";
import { runBatch } from "../../../../backend/convex/users/fileDeletion";
import { register } from "../../../../backend/convex/files/internal";
import { requireFileWrite } from "../../../../backend/convex/files/guard";

export const create = mutation({
  args: {},
  handler: (ctx) => ctx.db.insert("users", {}),
});
export const request = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const requestedAt = Date.now();
    await ctx.db.patch(userId, { deletionRequestedAt: requestedAt });
    return requestedAt;
  },
});
export const store = action({
  args: { userId: v.id("users"), missing: v.boolean() },
  handler: async (ctx, args) => {
    const storageId = await ctx.storage.store(new Blob(["synthetic file"]));
    if (args.missing) await ctx.storage.delete(storageId);
    const id = await ctx.runMutation(anyApi.fixture.record, {
      userId: args.userId,
      storageId,
    });
    return { id, storageId };
  },
});
export const record = mutation({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  handler: (ctx, a) =>
    ctx.db.insert("files", {
      owner: a.userId,
      filename: "fixture.txt",
      mediaType: "text/plain",
      size: 14,
      location: { provider: "convex", storageId: a.storageId },
    }),
});
export const r2 = mutation({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) =>
    ctx.db.insert("files", {
      owner: userId,
      filename: "fixture-r2",
      mediaType: "text/plain",
      size: 1,
      location: {
        provider: "r2",
        account: "synthetic",
        bucket: "synthetic",
        key: "synthetic",
      },
    }),
});
export const batch = mutation({
  args: { userId: v.id("users"), expectedRequestedAt: v.number() },
  handler: (ctx, args) => (runBatch as any)._handler(ctx, args),
});
export const rollback = mutation({
  args: { userId: v.id("users"), expectedRequestedAt: v.number() },
  handler: async (ctx, args) => {
    await (runBatch as any)._handler(ctx, args);
    throw new Error("synthetic rollback");
  },
});
export const inspect = query({
  args: { id: v.id("files"), storageId: v.id("_storage") },
  handler: async (ctx, a) => ({
    row: !!(await ctx.db.get(a.id)),
    blob: !!(await ctx.db.system.get("_storage", a.storageId)),
  }),
});
export const progress = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    (await ctx.db.get(userId))?.fileDeletion ?? null,
});
export const lateRegister = mutation({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  handler: (ctx, a) =>
    (register as any)._handler(
      {
        ...ctx,
        auth: { getUserIdentity: async () => ({ subject: "synthetic" }) },
        runQuery: async () => ({ userId: a.userId }),
      },
      {
        filename: "late.txt",
        mediaType: "text/plain",
        size: 1,
        location: { provider: "convex", storageId: a.storageId },
      },
    ),
});
export const uploadGuard = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireFileWrite(ctx as any, userId);
    return null;
  },
});

import { upload } from "../../../../backend/convex/files/index";
import { deletionPending } from "../../../../backend/convex/users/deletion";
export const pending = query({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) => deletionPending(ctx as any, userId),
});
export const uploadPending = action({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) =>
    (upload as any)._handler(
      {
        ...ctx,
        auth: { getUserIdentity: async () => ({ subject: "synthetic" }) },
        runQuery: (_ref: unknown, args: any) =>
          args.sessionId
            ? Promise.resolve({ userId })
            : ctx.runQuery(anyApi.fixture.pending, { userId }),
      },
      {
        filename: "late.txt",
        mediaType: "text/plain",
        bytes: new Uint8Array([1]).buffer,
      },
    ),
});
import { deletionRequests } from "../../../../backend/convex/users/internal";
export const queue = query({
  args: {},
  handler: (ctx) =>
    (deletionRequests as any)._handler(ctx, {
      paginationOpts: { numItems: 100, cursor: null },
    }),
});
