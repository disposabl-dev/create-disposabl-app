import { test } from "node:test";
import assert from "node:assert/strict";
import { getFunctionName } from "convex/server";
import {
  admitSession,
  claimWindow,
  sessionAllows,
  settle,
  uncertain,
  stopping,
  stopped,
  scheduleBoundary,
  notice,
} from "../backend/convex/agent/compute";

// Transaction fixtures exercise real handlers in serial commit order, not Convex OCC.
function fixture() {
  const rows = new Map<string, any>();
  const scheduled: { name: string; args: any; when: number }[] = [];
  let sequence = 0;
  const ctx: any = {
    db: {
      insert: async (table: string, row: any) => {
        const id = `${table}-${++sequence}`;
        rows.set(id, { ...row, _id: id, _creationTime: sequence, table });
        return id;
      },
      get: async (_table: string, id: string) => rows.get(id) ?? null,
      patch: async (_table: string, id: string, patch: any) =>
        Object.assign(rows.get(id), patch),
      query: (table: string) => {
        const conditions: [string, unknown][] = [];
        let reverse = false;
        const matches = () =>
          [...rows.values()]
            .filter(
              (row) =>
                row.table === table &&
                conditions.every(
                  ([key, value]) =>
                    key.split(".").reduce((r, field) => r?.[field], row) ===
                    value,
                ),
            )
            .sort((a, b) =>
              reverse
                ? b._creationTime - a._creationTime
                : a._creationTime - b._creationTime,
            );
        const chain = {
          withIndex: (_name: string, select: any) => {
            const index: any = {
              eq: (field: string, value: unknown) => {
                conditions.push([field, value]);
                return index;
              },
            };
            select(index);
            return chain;
          },
          order: () => {
            reverse = true;
            return chain;
          },
          first: async () => matches()[0] ?? null,
          take: async (n: number) => matches().slice(0, n),
        };
        return chain;
      },
      normalizeId: (_table: string, value: string) => value,
    },
    scheduler: {
      runAfter: async (when: number, ref: any, args: any) => {
        scheduled.push({ name: getFunctionName(ref), when, args });
        return "scheduled";
      },
      runAt: async (when: number, ref: any, args: any) => {
        scheduled.push({ name: getFunctionName(ref), when, args });
        return "scheduled";
      },
    },
    runMutation: async (ref: any, args: any) => {
      const name = getFunctionName(ref);
      if (name === "agent/compute:settle")
        return (settle as any)._handler(ctx, args);
      if (name === "product/lowCreditEmail:queue") {
        notices++;
        return "queued";
      }
      throw new Error(name);
    },
  };
  let notices = 0;
  return { ctx, rows, scheduled, notices: () => notices };
}

async function running() {
  const f = fixture();
  const sessionId = (await admitSession(f.ctx, "owner", true))!;
  const appId = await f.ctx.db.insert("apps", {
    userId: "owner",
    agent: { computeSessionId: sessionId, status: "processing" },
  });
  const debit = (await claimWindow(f.ctx, { sessionId }, true))!;
  return { ...f, sessionId, appId, debit };
}

test("two apps share a session; duplicate dispatch and renewal claims cannot charge twice", async () => {
  const f = await running();
  assert.equal(await admitSession(f.ctx, "owner", true), f.sessionId);
  assert.equal(
    await claimWindow(f.ctx, { sessionId: f.sessionId }, true),
    null,
  );
  await (settle as any)._handler(f.ctx, {
    debitId: f.debit._id,
    outcome: "confirmed",
  });
  assert.equal(
    await sessionAllows(f.ctx, f.sessionId, "owner", Date.now(), true),
    true,
  );
  assert.equal(
    await sessionAllows(f.ctx, f.sessionId, "other", Date.now(), true),
    false,
  );
  assert.equal(
    await sessionAllows(f.ctx, f.sessionId, "owner", f.debit.paidUntil, true),
    false,
  );
  f.rows.get(f.sessionId).paidUntil = 0;
  assert.equal(
    await claimWindow(
      f.ctx,
      { sessionId: f.sessionId, expectedDebit: f.debit._id },
      true,
    ),
    null,
  );
  assert.equal(f.rows.get(f.sessionId).state, "stopping");
  assert.equal(
    [...f.rows.values()].filter((r) => r.table === "computeDebits").length,
    1,
  );
});

test("lost debit response stays held, even after stop and a late success response", async () => {
  const f = await running();
  await (uncertain as any)._handler(f.ctx, { debitId: f.debit._id });
  await (settle as any)._handler(f.ctx, {
    debitId: f.debit._id,
    outcome: "confirmed",
  });
  assert.equal(f.rows.get(f.debit._id).state, "unknown");
  assert.equal(f.rows.get(f.sessionId).state, "hold");
  assert.equal(
    await claimWindow(f.ctx, { sessionId: f.sessionId }, true),
    null,
  );
  await assert.rejects(admitSession(f.ctx, "owner", true), /reconciliation/);
  assert.equal(
    await sessionAllows(f.ctx, f.sessionId, "owner", Date.now(), true),
    false,
  );
});

test("idle boundary stops without another debit and old timers cannot charge a new session", async () => {
  const f = await running();
  await (settle as any)._handler(f.ctx, {
    debitId: f.debit._id,
    outcome: "confirmed",
  });
  f.rows.get(f.sessionId).paidUntil = 0;
  f.rows.get(f.appId).agent.status = "idle";
  assert.equal(
    await claimWindow(
      f.ctx,
      { sessionId: f.sessionId, expectedDebit: f.debit._id },
      true,
    ),
    null,
  );
  assert.equal(f.rows.get(f.sessionId).state, "stopping");
  const before = f.scheduled.length;
  await scheduleBoundary(
    f.ctx,
    {
      sessionId: f.sessionId,
      expectedDebit: f.debit._id,
    },
    true,
  );
  assert.equal(f.scheduled.length, before);
});

test("normal stop serializes calls, waits for workers and requires an explicit new admission", async () => {
  const f = await running();
  await (settle as any)._handler(f.ctx, {
    debitId: f.debit._id,
    outcome: "denied",
  });
  const stop = (token: string) =>
    (stopping as any)._handler(f.ctx, { sessionId: f.sessionId, token });
  assert.equal(await stop("first"), true);
  assert.equal(await stop("overlap"), false);
  f.rows.get(f.appId).agent.lease = { token: "old-worker" };
  await (stopped as any)._handler(f.ctx, {
    sessionId: f.sessionId,
    token: "first",
    archived: true,
  });
  assert.equal(f.rows.get(f.sessionId).state, "stopping");
  await assert.rejects(admitSession(f.ctx, "owner", true), /stopping/);
  delete f.rows.get(f.appId).agent.lease;
  assert.equal(await stop("last"), true);
  await (stopped as any)._handler(f.ctx, {
    sessionId: f.sessionId,
    token: "last",
    archived: true,
  });
  assert.equal(f.rows.get(f.sessionId).state, "stopped");
  const next = await admitSession(f.ctx, "owner", true);
  assert.notEqual(next, f.sessionId);
  assert.equal(await stop("stale"), false);
});

test("boundary recovery is armed before renewal; notices cannot replay after completion", async () => {
  const f = await running();
  await (settle as any)._handler(f.ctx, {
    debitId: f.debit._id,
    outcome: "confirmed",
    responseBalance: 9,
  });
  await scheduleBoundary(
    f.ctx,
    {
      sessionId: f.sessionId,
      expectedDebit: f.debit._id,
    },
    true,
  );
  assert.ok(
    f.scheduled.some(
      (r) => r.name === "agent/compute:boundary" && r.when === 30_000,
    ),
  );
  assert.ok(f.scheduled.some((r) => r.name === "agent/actions/compute:renew"));
  f.rows.set("owner", { _id: "owner" });
  const observation = {
    userId: "owner",
    paidUntil: f.debit.paidUntil,
    balance: 9,
    observedAt: Date.now(),
  };
  await (notice as any)._handler(f.ctx, { debitId: f.debit._id, observation });
  await (notice as any)._handler(f.ctx, { debitId: f.debit._id, observation });
  assert.equal(f.notices(), 1);
  const empty = fixture();
  assert.equal(await admitSession(empty.ctx, "owner", false), undefined);
  assert.equal(
    await sessionAllows(empty.ctx, undefined, "owner", Date.now(), false),
    true,
  );
  assert.equal(empty.rows.size, 0);
});

test("an in-flight confirmed renewal after expiry is held without granting a window", async () => {
  const f = await running();
  await (settle as any)._handler(f.ctx, {
    debitId: f.debit._id,
    outcome: "confirmed",
  });
  const oldDeadline = f.rows.get(f.sessionId).paidUntil;
  const debitId = await f.ctx.db.insert("computeDebits", {
    sessionId: f.sessionId,
    state: "dispatching",
    paidUntil: Date.now() + 600_000,
  });
  f.rows.get(f.sessionId).debitId = debitId;
  f.rows.get(f.sessionId).paidUntil = 0;
  await (settle as any)._handler(f.ctx, {
    debitId,
    outcome: "confirmed",
    responseBalance: 0,
  });
  assert.equal(f.rows.get(debitId).state, "confirmed");
  assert.equal(f.rows.get(debitId).responseBalance, 0);
  assert.equal(f.rows.get(f.sessionId).state, "hold");
  assert.equal(f.rows.get(f.sessionId).paidUntil, 0);
  assert.ok(oldDeadline > 0);
  assert.equal(
    await sessionAllows(f.ctx, f.sessionId, "owner", Date.now(), true),
    false,
  );
  await assert.rejects(admitSession(f.ctx, "owner", true), /reconciliation/);
});
