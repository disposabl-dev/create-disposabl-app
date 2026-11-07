import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ownedAttachments,
  attachmentReferences,
  attachmentPrompt,
} from "../backend/convex/agent/attachments";

test("agent attachments reject foreign owners, duplicates, and excessive sets before delivery", async () => {
  const file: any = {
    _id: "file-id",
    owner: "owner",
    filename: "spec.txt",
    mediaType: "text/plain",
  };
  const ctx: any = { db: { get: async () => file } };
  assert.deepEqual(await ownedAttachments(ctx, "owner", ["file-id"] as any), [
    file,
  ]);
  await assert.rejects(
    ownedAttachments(ctx, "stranger", ["file-id"] as any),
    /File not found/,
  );
  await assert.rejects(
    ownedAttachments(ctx, "owner", ["file-id", "file-id"] as any),
    /Duplicate/,
  );
  await assert.rejects(
    ownedAttachments(ctx, "owner", Array(11).fill("file-id")),
    /no more than 10/,
  );
});
test("history keeps attachment metadata without exposing download URLs", () => {
  assert.deepEqual(
    attachmentReferences([
      { type: "text", text: "Read this" },
      {
        type: "file",
        data: { type: "reference", reference: { disposablFile: "file-id" } },
        filename: "spec.txt",
        mediaType: "text/plain",
      },
    ]),
    [{ id: "file-id", filename: "spec.txt", mediaType: "text/plain" }],
  );
});
test("delivery resolves fresh URLs and fails if storage has disappeared", async () => {
  const ctx: any = {
    runQuery: async () => [
      {
        filename: "spec.txt",
        mediaType: "text/plain",
        location: { provider: "convex", storageId: "storage" },
      },
    ],
    storage: { getUrl: async () => "https://storage.example/fresh" },
  };
  assert.match(
    await attachmentPrompt(ctx, "owner", ["file-id"] as any),
    /https:\/\/storage.example\/fresh/,
  );
  ctx.storage.getUrl = async () => null;
  await assert.rejects(
    attachmentPrompt(ctx, "owner", ["file-id"] as any),
    /no longer available/,
  );
});
