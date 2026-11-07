import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isNearConversationEnd } from "../../apps/mobile/src/features/management/conversation-scroll";

describe("conversation follow position", () => {
  test("follows short transcripts and a reader near the latest message", () => {
    assert.equal(isNearConversationEnd(0, 600, 300), true);
    assert.equal(isNearConversationEnd(320, 600, 1000), true);
  });

  test("does not follow when the reader is further up the transcript", () => {
    assert.equal(isNearConversationEnd(319, 600, 1000), false);
    assert.equal(isNearConversationEnd(0, 600, 1800), false);
  });
});
