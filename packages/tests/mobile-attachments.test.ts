import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachmentIds,
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
