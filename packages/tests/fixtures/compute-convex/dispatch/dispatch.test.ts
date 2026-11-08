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

test(
  "registered renew dispatches through its default adapter when the claim is eligible",
  { skip: !base },
  async () => {
    const userId = "synthetic-renew-control";
    const sessionId = await m("seed", { userId });
    await a("fund", { sessionId });
    const before = await q("inspect", { sessionId, userId });
    assert.equal(before.calls, 1);
    const expectedDebit = before.debits[0]._id;
    await m("prepareEligibleRenewal", { sessionId });
    await a("renew", { sessionId, expectedDebit });
    const after = await q("inspect", { sessionId, userId });
    assert.equal(after.calls, 2);
    assert.equal(after.debits.length, 2);
    assert.equal(after.session.state, "active");
    assert.notEqual(after.session.debitId, expectedDebit);
    assert.equal(
      after.debits.find((debit: any) => debit._id === after.session.debitId)
        .state,
      "confirmed",
    );
  },
);

test(
  "registered renew callbacks never dispatch for active, stale or expired windows",
  { skip: !base },
  async () => {
    const userId = "synthetic-confirmed";
    const sessionId = await m("seed", { userId });
    await Promise.all(
      Array.from({ length: 5 }, () => a("fund", { sessionId })),
    );
    const first = await q("inspect", { sessionId, userId });
    assert.equal(first.calls, 1);
    assert.equal(first.debits.length, 1);
    assert.equal(first.debits[0].state, "confirmed");
    assert.equal(first.session.state, "active");
    const expectedDebit = first.debits[0]._id;
    await Promise.all(
      Array.from({ length: 5 }, () => a("renew", { sessionId, expectedDebit })),
    );
    const otherId = "synthetic-stale";
    const otherSession = await m("seed", { userId: otherId });
    await a("fund", { sessionId: otherSession });
    const other = await q("inspect", {
      sessionId: otherSession,
      userId: otherId,
    });
    await a("renew", { sessionId, expectedDebit: other.debits[0]._id });
    let current = await q("inspect", { sessionId, userId });
    assert.equal(current.calls, 1);
    assert.equal(current.debits.length, 1);
    assert.equal(current.session.state, "active");
    await m("expire", { sessionId });
    await Promise.all(
      Array.from({ length: 4 }, () => a("renew", { sessionId, expectedDebit })),
    );
    current = await q("inspect", { sessionId, userId });
    assert.equal(current.calls, 1);
    assert.equal(current.debits.length, 1);
    assert.equal(current.session.state, "stopping");
  },
);

test(
  "unknown initial debit cannot be dispatched twice",
  { skip: !base },
  async () => {
    const userId = "synthetic-unknown";
    const sessionId = await m("seed", { userId });
    await Promise.all(
      Array.from({ length: 5 }, () => a("fund", { sessionId })),
    );
    await a("fund", { sessionId });
    const result = await q("inspect", { sessionId, userId });
    assert.equal(result.calls, 1);
    assert.equal(result.debits.length, 1);
    assert.equal(result.debits[0].state, "unknown");
    assert.equal(result.session.state, "hold");
  },
);
