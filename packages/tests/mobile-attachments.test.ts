import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { root } from "./project";
import {
  ATTACHMENT_SIZE_ERROR,
  attachmentIds,
  attachmentUploadError,
  MAX_ATTACHMENTS,
} from "../../apps/mobile/src/features/studio/attachment-policy";

test("only complete, bounded attachment sets can be sent", () => {
  assert.deepEqual(attachmentIds([]), []);
  assert.deepEqual(attachmentIds([{ id: "file-1" }, { id: "file-2" }]), [
    "file-1",
    "file-2",
  ]);
  assert.equal(attachmentIds([{ id: "file-1" }, {}]), null);
  assert.equal(
    attachmentIds(
      Array.from({ length: MAX_ATTACHMENTS + 1 }, () => ({ id: "file" })),
    ),
    null,
  );
});

test("attachment upload errors stay actionable without exposing backend internals", () => {
  assert.equal(
    attachmentUploadError(new Error(ATTACHMENT_SIZE_ERROR)),
    ATTACHMENT_SIZE_ERROR,
  );
  assert.equal(
    attachmentUploadError(
      new Error(
        "[CONVEX A(files/index:upload)] Connection lost while action was in flight\nCalled by client",
      ),
    ),
    "Could not upload the file. Check your connection and try again.",
  );
});

test("product Expo configuration permits Android dictation and preserves its iOS purpose", () => {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("CONVEX_") || key.startsWith("EXPO_PUBLIC_CONVEX_"))
      delete env[key];
  const result = spawnSync(
    "bun",
    ["x", "--no-install", "expo", "config", "--type", "prebuild", "--json"],
    {
      cwd: join(root, "apps/mobile"),
      env: { ...env, EXPO_NO_DOTENV: "1", EXPO_NO_TELEMETRY: "1" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.ok(
    config.android.permissions.includes("android.permission.RECORD_AUDIO"),
  );
  assert.ok(
    !config.android.blockedPermissions?.includes(
      "android.permission.RECORD_AUDIO",
    ),
  );
  assert.equal(
    config.ios.infoPlist.NSMicrophoneUsageDescription,
    "Allow $(PRODUCT_NAME) to use your microphone for dictation.",
  );
});
