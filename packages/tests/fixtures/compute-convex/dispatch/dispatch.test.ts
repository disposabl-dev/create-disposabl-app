import { test } from "node:test";
import assert from "node:assert/strict";
const base = process.env.COMPUTE_DISPATCH_FIXTURE_URL;
if (base && base !== "http://127.0.0.1:3540")
  throw new Error("Requires isolated loopback 3540");
async function call(
  kind: "action" | "query" | "mutation",
  name: string,
  args: object,
): Promise<any> {
  const response = await fetch(`${base}/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: `fixture:${name}`, args, format: "json" }),
  });
  const result = (await response.json()) as any;
  if (result.status !== "success")
    throw new Error(result.errorMessage ?? "fixture call failed");
  return result.value;
}
const m = (name: string, args: object) => call("mutation", name, args);
const a = (name: string, args: object) => call("action", name, args);
const q = (name: string, args: object) => call("query", name, args);
async function funded() {
  const ids = await m("seed", { outcome: "confirmed" });
  await a("fund", { sessionId: ids.sessionId });
  const first = await q("inspect", ids);
  assert.equal(first.calls, 1);
  assert.equal(first.session.state, "active");
  assert.equal(first.debits[0].state, "confirmed");
  return { ...ids, first };
}

test(
  "registered renewal charges once at the active boundary; a low remaining balance keeps the paid window",
  { skip: !base },
  async () => {
    const { userId, sessionId, first } = await funded();
    const expectedDebit = first.session.debitId;
    await Promise.all(
      Array.from({ length: 4 }, () => a("renew", { sessionId, expectedDebit })),
    );
    assert.equal((await q("inspect", { userId, sessionId })).calls, 1);
    const other = await funded();
    await a("renew", { sessionId, expectedDebit: other.first.session.debitId });
    assert.equal((await q("inspect", { userId, sessionId })).calls, 1);
    await m("setOutcome", { userId, outcome: "confirmed", responseBalance: 4 });
    await m("expire", { sessionId });
    await Promise.all(
      Array.from({ length: 5 }, () => a("renew", { sessionId, expectedDebit })),
    );
    const after = await q("inspect", { sessionId, userId });
    assert.equal(after.calls, 2);
    assert.equal(after.debits.length, 2);
    assert.equal(after.session.state, "active");
    assert.notEqual(after.session.debitId, expectedDebit);
    const debit = after.debits.find(
      (item: any) => item._id === after.session.debitId,
    );
    assert.equal(debit.state, "confirmed");
    assert.equal(debit.responseBalance, 4);
    assert.equal(debit.paidUntil, after.session.paidUntil);
    assert.ok(after.session.paidUntil > Date.now());
    let noticeCount = 0;
    for (let i = 0; i < 100 && noticeCount === 0; i++) {
      noticeCount = await q("noticeCount", { debitId: debit._id });
      if (!noticeCount) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(noticeCount, 1);
    await a("renew", { sessionId, expectedDebit });
    assert.equal((await q("inspect", { sessionId, userId })).calls, 2);
  },
);

test(
  "insufficient boundary debit stops and callbacks cannot restart the old session",
  { skip: !base },
  async () => {
    const { userId, sessionId, first } = await funded();
    const expectedDebit = first.session.debitId;
    await m("setOutcome", { userId, outcome: "denied" });
    await m("expire", { sessionId });
    await a("renew", { sessionId, expectedDebit });
    let after = await q("inspect", { userId, sessionId });
    assert.equal(after.calls, 2);
    assert.equal(
      after.debits.find((d: any) => d._id === after.session.debitId).state,
      "denied",
    );
    assert.ok(["stopping", "stopped"].includes(after.session.state));
    await Promise.all([
      a("fund", { sessionId }),
      a("renew", { sessionId, expectedDebit }),
    ]);
    after = await q("inspect", { userId, sessionId });
    assert.equal(after.calls, 2);
    assert.notEqual(after.session.state, "active");
    await assert.rejects(m("simulateFreshMessage", { userId }));
    await m("simulateArchivedDrain", { sessionId });
    assert.equal(
      (await q("inspect", { userId, sessionId })).session.state,
      "stopped",
    );
    assert.equal((await q("inspect", { userId, sessionId })).calls, 2);
    await m("setOutcome", { userId, outcome: "confirmed" });
    const newSessionId = await m("simulateFreshMessage", { userId });
    assert.notEqual(newSessionId, sessionId);
    assert.equal(
      (await q("inspect", { userId, sessionId: newSessionId })).calls,
      2,
    );
    await a("fund", { sessionId: newSessionId });
    const resumed = await q("inspect", { userId, sessionId: newSessionId });
    assert.equal(resumed.calls, 3);
    assert.equal(resumed.session.state, "active");
  },
);

test(
  "unknown boundary result holds and cannot dispatch a second debit",
  { skip: !base },
  async () => {
    const { userId, sessionId, first } = await funded();
    const expectedDebit = first.session.debitId;
    await m("setOutcome", { userId, outcome: "unknown" });
    await m("expire", { sessionId });
    await a("renew", { sessionId, expectedDebit });
    await Promise.all([
      a("fund", { sessionId }),
      a("renew", { sessionId, expectedDebit }),
    ]);
    const after = await q("inspect", { userId, sessionId });
    assert.equal(after.calls, 2);
    assert.equal(after.session.state, "hold");
    assert.equal(
      after.debits.find((d: any) => d._id === after.session.debitId).state,
      "unknown",
    );
  },
);

test(
  "confirmation after uncertainty cannot revive a timed-out boundary",
  { skip: !base, timeout: 20_000 },
  async () => {
    const { userId, sessionId, first } = await funded();
    await m("setOutcome", { userId, outcome: "deferred" });
    await m("expire", { sessionId });
    const pending = a("renew", {
      sessionId,
      expectedDebit: first.session.debitId,
    });
    try {
      let current;
      for (let i = 0; i < 100; i++) {
        current = await q("inspect", { userId, sessionId });
        if (current.calls === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(current.calls, 2);
      const debitId = current.session.debitId;
      assert.notEqual(debitId, first.session.debitId);
      await m("timeout", { debitId });
      assert.equal(
        (await q("inspect", { userId, sessionId })).session.state,
        "hold",
      );
      await m("setOutcome", { userId, outcome: "confirmed" });
      await pending;
      const after = await q("inspect", { userId, sessionId });
      assert.equal(after.calls, 2);
      assert.notEqual(after.session.state, "active");
      assert.ok(
        after.debits.find((d: any) => d._id === debitId).lateConfirmation,
      );
    } finally {
      await m("setOutcome", { userId, outcome: "confirmed" });
      await pending.catch(() => {});
    }
  },
);
