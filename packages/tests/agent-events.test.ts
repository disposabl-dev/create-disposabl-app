import { test } from "node:test";
import assert from "node:assert/strict";
import { boat } from "../backend/convex/agent/boat";
import { syncResponses } from "../backend/convex/agent/events";
import { tick } from "../backend/convex/agent/actions/run";
import { getFunctionName } from "convex/server";
test("oversized tool logs cannot block response sync or stop reconciliation", async () => {
  const original = boat.events;
  let appended: any;
  try {
    boat.events = async () =>
      ({
        events: [
          {
            id: "response",
            type: "response",
            conversationId: "conversation",
            data: {
              content: "The app is ready.",
              tools: [{ output: "x".repeat(107231) }],
              is_streaming: false,
              is_reverted: false,
            },
          },
        ],
        nextCursor: null,
      }) as any;
    const result = await syncResponses(
      {
        runMutation: async (_ref: any, args: any) => {
          appended = args;
          return false;
        },
      } as any,
      { conversationId: "conversation", userId: "owner", appId: "app" } as any,
      { id: "thread", token: "lease" },
    );
    assert.equal(appended.events[0].content, "The app is ready.");
    assert.equal(appended.events[0].tools, undefined);
    assert.deepEqual(result, { more: false, mutable: false });
  } finally {
    boat.events = original;
  }
});

test("unavailable attachments finish an empty run but preserve active steering", async () => {
  const refresh = boat.refresh;
  const promptStatus = boat.promptStatus;
  try {
    boat.refresh = async () =>
      ({ sandboxId: "sandbox", state: "running" }) as any;
    for (const running of [undefined, false, true]) {
      boat.promptStatus = async () => ({ done: !running }) as any;
      let query = 0;
      const mutations: { name: string; args: any }[] = [];
      await (tick as any)._handler(
        {
          runQuery: async (ref: any) => {
            try {
              if (getFunctionName(ref) === "users/internal:deletionPending")
                return false;
            } catch {
              // Component references are not local function references.
            }
            if (++query === 1)
              return { sandboxId: "sandbox", state: "running" };
            if (query === 2) return {};
            throw new Error("Attachment was deleted after enqueue");
          },
          runMutation: async (ref: any, args: any) => {
            const name = getFunctionName(ref);
            mutations.push({ name, args });
            if (name === "agent/state:claim")
              return {
                userId: "owner",
                appId: "app",
                status: "processing",
                ...(running !== undefined
                  ? { promptId: "prompt", conversationId: "conversation" }
                  : {}),
              };
            if (name === "agent/state:next")
              return {
                messageId: "message",
                prompt: "Read this",
                fileIds: ["deleted-file"],
              };
            return null;
          },
        },
        { id: "thread" },
      );
      assert.ok(
        mutations.some(({ name }) => name === "agent/attachments:reject"),
      );
      const finish = mutations.find(
        ({ name }) => name === "agent/state:finish",
      )!;
      assert.equal(finish.args.done, running !== true);
      assert.equal(finish.args.error, undefined);
    }
  } finally {
    boat.refresh = refresh;
    boat.promptStatus = promptStatus;
  }
});
