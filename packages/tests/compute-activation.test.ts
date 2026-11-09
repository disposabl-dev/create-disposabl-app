import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claimActivation,
  completeActivation,
  uncertainActivation,
  archiveStop,
} from "../backend/convex/agent/activation";
import { stopping } from "../backend/convex/agent/compute";

function fixture() {
  const rows: any[] = [
    { _id: "u", table: "users" },
    {
      _id: "s",
      table: "computeSessions",
      userId: "u",
      state: "active",
      paidUntil: Date.now() + 60000,
      activation: "fresh",
    },
  ];
  const jobs: any[] = [];
  const ctx: any = {
    db: {
      normalizeId: (_: string, id: string) => id,
      get: async (_: string, id: string) =>
        rows.find((x) => x._id === id) ?? null,
      patch: async (_: string, id: string, patch: object) =>
        Object.assign(
          rows.find((x) => x._id === id),
          patch,
        ),
      query: (table: string) => {
        const conditions: [string, unknown][] = [];
        const q: any = {
          eq(k: string, v: unknown) {
            conditions.push([k, v]);
            return q;
          },
        };
        const matches = () =>
          rows.filter(
            (x) =>
              x.table === table && conditions.every(([k, v]) => x[k] === v),
          );
        const chain: any = {
          withIndex(_: string, f: (q: any) => void) {
            f(q);
            return chain;
          },
          order() {
            return chain;
          },
          async first() {
            return matches().at(-1) ?? null;
          },
          async take(n: number) {
            return matches().slice(0, n);
          },
        };
        return chain;
      },
    },
    scheduler: {
      async runAfter(...x: any[]) {
        jobs.push(x);
      },
      async runAt(...x: any[]) {
        jobs.push(x);
      },
    },
  };
  return { ctx, rows, jobs, session: rows[1] };
}
const args = { sessionId: "s" as any, token: "a" };
test("claims serialize, completion is token fenced, uncertain stops after action fence", async () => {
  const f = fixture();
  assert.equal(await claimActivation(f.ctx, args), "claimed");
  assert.equal(
    await claimActivation(f.ctx, { ...args, token: "b" }),
    "blocked",
  );
  assert.equal(await completeActivation(f.ctx, { ...args, token: "b" }), false);
  assert.equal(await uncertainActivation(f.ctx, args), true);
  assert.equal(f.session.state, "stopping");
  assert.equal(await claimActivation(f.ctx, args), "blocked");
  assert.equal(
    await (stopping as any)._handler(f.ctx, { sessionId: "s", token: "stop" }),
    false,
  );
  assert.ok(f.jobs.some((x) => x[0] === f.session.activationLease.until));
  f.session.activationLease.until = Date.now() - 1;
  assert.equal(
    await (stopping as any)._handler(f.ctx, { sessionId: "s", token: "stop" }),
    true,
  );
});
test("legacy rows normalize in bounded batches and late uncertainty blocks", async () => {
  const f = fixture();
  for (let i = 0; i < 101; i++)
    f.rows.push({
      _id: `app${i}`,
      table: "apps",
      userId: "u",
      ...(i === 100
        ? {
            agent: {
              threadId: "t",
              status: "failed",
              pending: [],
              updatedAt: 1,
              delivery: "x",
            },
          }
        : {}),
    });
  assert.equal(await claimActivation(f.ctx, args), "wait");
  assert.equal(await claimActivation(f.ctx, args), "wait");
  assert.equal(await claimActivation(f.ctx, args), "wait");
  assert.equal(f.session.activation, "fresh");
});
test("expired, deleted or replaced completion cannot reactivate", async () => {
  for (const change of ["expired", "deleted", "replaced", "lease"]) {
    const f = fixture();
    assert.equal(await claimActivation(f.ctx, args), "claimed");
    if (change === "expired") f.session.paidUntil = 0;
    if (change === "deleted") f.rows[0].deletionRequestedAt = 1;
    if (change === "replaced")
      f.rows.push({ _id: "new", table: "computeSessions", userId: "u" });
    if (change === "lease") f.session.activationLease.until = 0;
    assert.equal(await completeActivation(f.ctx, args), false);
    assert.equal(f.session.activation, "claimed");
  }
});
test("fresh completion and legacy or activated archive behavior", async () => {
  const f = fixture();
  assert.equal(await claimActivation(f.ctx, args), "claimed");
  assert.equal(await completeActivation(f.ctx, args), true);
  assert.equal(f.session.activation, "active");
  assert.equal(await archiveStop(f.ctx, { sessionId: "s" as any }), true);
  assert.equal(f.session.state, "stopping");
  const legacy = fixture();
  delete legacy.session.activation;
  assert.equal(await claimActivation(legacy.ctx, args), "blocked");
  assert.equal(await archiveStop(legacy.ctx, { sessionId: "s" as any }), true);
  const fresh = fixture();
  assert.equal(await archiveStop(fresh.ctx, { sessionId: "s" as any }), false);
});

test("archive during activation fences a delayed provider completion", async () => {
  const f = fixture();
  assert.equal(await claimActivation(f.ctx, args), "claimed");
  assert.equal(await archiveStop(f.ctx, { sessionId: "s" as any }), true);
  assert.equal(await completeActivation(f.ctx, args), false);
  assert.equal(f.session.state, "stopping");
  assert.equal(
    await (stopping as any)._handler(f.ctx, { sessionId: "s", token: "stop" }),
    false,
  );
});
