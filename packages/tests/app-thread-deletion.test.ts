import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmThreadDeletion,
  erase,
} from "../backend/convex/apps/operations/internal";

const appId = "11111111-1111-4111-8111-111111111111";
const args = { userId: "owner", appId, until: 12, threadId: "thread" };
function context(responses: unknown[]) {
  const app = {
    _id: "app-row",
    appId,
    userId: "owner",
    agent: { threadId: "thread" },
    operation: { kind: "delete", until: 12 },
  };
  let patched = false;
  return {
    ctx: {
      db: {
        query: (table: string) => ({
          withIndex: () => ({
            unique: async () => (table === "apps" ? app : null),
            take: async () => [],
          }),
        }),
        patch: async () => {
          patched = true;
        },
        delete: async () => {
          throw new Error("app must remain");
        },
      },
      runQuery: async () => responses.shift(),
    },
    patched: () => patched,
  };
}

test("thread cleanup confirmation requires absent thread, messages and streams", async () => {
  for (const answers of [
    [{}, { page: [] }, []],
    [null, { page: [{}] }, []],
    [null, { page: [] }, [{}]],
  ]) {
    const { ctx, patched } = context(answers);
    await assert.rejects(
      (confirmThreadDeletion as any)._handler(ctx, args),
      /not complete|remain/,
    );
    assert.equal(patched(), false);
  }
  const { ctx, patched } = context([null, { page: [] }, []]);
  await (confirmThreadDeletion as any)._handler(ctx, args);
  assert.equal(patched(), true);
});

test("app row stays when agent cleanup has not been confirmed", async () => {
  const { ctx } = context([]);
  await assert.rejects(
    (erase as any)._handler(ctx, args),
    /cleanup is not confirmed/,
  );
});
