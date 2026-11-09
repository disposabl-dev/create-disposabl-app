import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  env,
} from "../../backend/convex/_generated/server";
import { makeFunctionReference, type Auth } from "convex/server";
import { getSessionUserId } from "./lib/functions";
import type { Id } from "../../backend/convex/_generated/dataModel";
import type {
  ActionCtx,
  MutationCtx,
} from "../../backend/convex/_generated/server";
import {
  deleteThenForget,
  r2Config,
  r2Delete,
  r2Url,
  r2Write,
  registerWithRollback,
  requireOwner,
  validateUpload,
} from "./files";

const location = v.union(
  v.object({ provider: v.literal("convex"), storageId: v.id("_storage") }),
  v.object({
    provider: v.literal("r2"),
    key: v.string(),
    account: v.string(),
    bucket: v.string(),
  }),
);
const fields = {
  owner: v.string(),
  filename: v.string(),
  mediaType: v.string(),
  size: v.number(),
  location,
};
export const fileValidator = v.object({
  ...fields,
  _id: v.id("files"),
  _creationTime: v.number(),
});
type FileRecord = {
  _id: Id<"files">;
  _creationTime: number;
  owner: string;
  filename: string;
  mediaType: string;
  size: number;
  location:
    | { provider: "convex"; storageId: Id<"_storage"> }
    | { provider: "r2"; key: string; account: string; bucket: string };
};
const registerRef = makeFunctionReference<
  "mutation",
  {
    filename: string;
    mediaType: string;
    size: number;
    location: FileRecord["location"];
  },
  Id<"files">
>("files/internal:register");
const getRef = makeFunctionReference<"query", { id: Id<"files"> }, FileRecord>(
  "files/internal:getOwned",
);
const forgetRef = makeFunctionReference<"mutation", { id: Id<"files"> }, null>(
  "files/internal:forget",
);
async function owner(ctx: { auth: Auth }) {
  const userId = await getSessionUserId(ctx);
  if (!userId) throw new Error("Authentication required.");
  return userId;
}
export type FileWriteGuard = (
  ctx: ActionCtx | MutationCtx,
  userId: string,
) => Promise<void>;

export const createRegister = (guard?: FileWriteGuard) =>
  internalMutation({
    args: {
      filename: v.string(),
      mediaType: v.string(),
      size: v.number(),
      location,
    },
    returns: v.id("files"),
    handler: async (ctx, args) => {
      const userId = await owner(ctx);
      if (guard) await guard(ctx, userId);
      return ctx.db.insert("files", { ...args, owner: userId });
    },
  });
export const register = createRegister();
export const getOwned = internalQuery({
  args: { id: v.id("files") },
  returns: fileValidator,
  handler: async (ctx, { id }) =>
    requireOwner(await ctx.db.get("files", id), await owner(ctx)),
});
export const forget = internalMutation({
  args: { id: v.id("files") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    requireOwner(await ctx.db.get("files", id), await owner(ctx));
    await ctx.db.delete("files", id);
    return null;
  },
});

export const createUpload = (guard?: FileWriteGuard) =>
  action({
    args: { filename: v.string(), mediaType: v.string(), bytes: v.bytes() },
    returns: v.id("files"),
    handler: async (
      ctx,
      { filename, mediaType, bytes },
    ): Promise<Id<"files">> => {
      const userId = await owner(ctx);
      if (guard) await guard(ctx, userId);
      validateUpload(filename, mediaType, bytes);
      const config = r2Config(env);
      return (await registerWithRollback(
        async (): Promise<FileRecord["location"]> => {
          if (config) {
            const loc = {
              provider: "r2" as const,
              key: crypto.randomUUID(),
              account: config.account,
              bucket: config.bucket,
            };
            await r2Write(loc, env, bytes, mediaType);
            return loc;
          }
          return {
            provider: "convex",
            storageId: await ctx.storage.store(
              new Blob([bytes], { type: mediaType }),
            ),
          };
        },
        (loc) =>
          ctx.runMutation(registerRef, {
            filename: filename.trim(),
            mediaType,
            size: bytes.byteLength,
            location: loc,
          }),
        (loc) =>
          loc.provider === "r2"
            ? r2Delete(loc, env)
            : ctx.storage.delete(loc.storageId),
      )) as Id<"files">;
    },
  });
export const upload = createUpload();
async function resolve(ctx: ActionCtx, id: Id<"files">) {
  const file = await ctx.runQuery(getRef, { id });
  const url =
    file.location.provider === "r2"
      ? await r2Url(file.location, env)
      : await ctx.storage.getUrl(file.location.storageId);
  if (!url) throw new Error("File is unavailable.");
  return {
    url,
    filename: file.filename,
    mediaType: file.mediaType,
    size: file.size,
  };
}
const result = v.object({
  url: v.string(),
  filename: v.string(),
  mediaType: v.string(),
  size: v.number(),
});
export const getDownload = action({
  args: { id: v.id("files") },
  returns: result,
  handler: async (ctx, { id }) => resolve(ctx, id),
});
export const resolveAttachments = action({
  args: { ids: v.array(v.id("files")) },
  returns: v.array(result),
  handler: async (ctx, { ids }) => {
    if (ids.length > 10) throw new Error("Attach no more than 10 files.");
    await owner(ctx);
    return Promise.all(ids.map((id) => resolve(ctx, id)));
  },
});
export const remove = action({
  args: { id: v.id("files") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const file = await ctx.runQuery(getRef, { id });
    await deleteThenForget(
      () =>
        file.location.provider === "r2"
          ? r2Delete(file.location, env)
          : ctx.storage.delete(file.location.storageId),
      async () => {
        await ctx.runMutation(forgetRef, { id });
      },
    );
    return null;
  },
});
