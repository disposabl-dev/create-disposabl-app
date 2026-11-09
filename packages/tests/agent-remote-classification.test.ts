import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRemoteWork,
  patchThread,
  remoteUnresolved,
} from "../backend/convex/agent/threads";

test("bounded legacy normalization reaches late unresolved work", async () => {
  const completed = {
    threadId: "done",
    status: "idle",
    pending: [],
    updatedAt: 3,
    startedAt: 1,
    finishedAt: 2,
    promptId: "old",
    conversationId: "history",
  };
  const rows: any[] = Array.from({ length: 111 }, (_, i) => ({
    _id: String(i),
    userId: "u",
    appId: String(i),
    ...(i === 108
      ? { agent: { ...completed, status: "failed", delivery: "uncertain" } }
      : i === 0
        ? { agent: completed }
        : {}),
  }));
  const db: any = {
    query() {
      return {
        withIndex(_name: string, fn: (q: any) => void) {
          const terms: Record<string, unknown> = {};
          const q = {
            eq(k: string, v: unknown) {
              terms[k] = v;
              return q;
            },
          };
          fn(q);
          const found = () =>
            rows.filter((row) =>
              Object.entries(terms).every(([k, v]) => row[k] === v),
            );
          return {
            take: async (n: number) => found().slice(0, n),
            first: async () => found()[0] ?? null,
            unique: async () => found()[0] ?? null,
          };
        },
      };
    },
    async patch(_table: string, id: string, update: object) {
      Object.assign(
        rows.find((x) => x._id === id),
        update,
      );
    },
  };
  const ctx: any = { db };
  assert.deepEqual(await normalizeRemoteWork(ctx, "u"), {
    pending: true,
    unresolved: false,
  });
  assert.deepEqual(await normalizeRemoteWork(ctx, "u"), {
    pending: true,
    unresolved: false,
  });
  assert.deepEqual(await normalizeRemoteWork(ctx, "u"), {
    pending: false,
    unresolved: true,
  });
  assert.equal(rows[0].agentRemoteUnresolved, false);
  assert.equal(rows[108].agentRemoteUnresolved, true);
  rows.push({
    _id: "late",
    userId: "u",
    appId: "late",
    agent: { ...completed, delivery: "late" },
  });
  assert.deepEqual(await normalizeRemoteWork(ctx, "u"), {
    pending: false,
    unresolved: true,
  });
  await patchThread(ctx, { ...completed, userId: "u", appId: "0" } as any, {
    turnCompleted: true,
    promptId: undefined,
  });
  assert.equal(rows[0].agentRemoteUnresolved, false);
  await patchThread(ctx, { ...completed, userId: "u", appId: "0" } as any, {
    delivery: "new",
  });
  assert.equal(rows[0].agentRemoteUnresolved, true);
});

test("unresolved predicate fails closed except strict historical completion", () => {
  const base: any = {
    threadId: "t",
    status: "idle",
    pending: [],
    updatedAt: 3,
    startedAt: 1,
    finishedAt: 2,
    promptId: "p",
    conversationId: "c",
  };
  assert.equal(remoteUnresolved(undefined), false);
  assert.equal(remoteUnresolved(base), false);
  for (const patch of [
    { delivery: "x" },
    { stopUnconfirmed: true },
    { status: "failed" },
    { lease: { token: "t" } },
    { error: "error" },
    { finishedAt: 0 },
  ])
    assert.equal(remoteUnresolved({ ...base, ...patch }), true);
  assert.equal(
    remoteUnresolved({ ...base, turnCompleted: true, promptId: undefined }),
    false,
  );
  assert.equal(
    remoteUnresolved({ ...base, turnCompleted: false, promptId: undefined }),
    true,
  );
});
