import { test } from "node:test";
import assert from "node:assert/strict";

const base = process.env.EPHEMERAL_DELETION_FIXTURE_URL;
if (base && base !== "http://127.0.0.1:3540")
  throw new Error("Fixture requires isolated loopback port 3540");
async function call(
  kind: "mutation" | "query",
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
    throw new Error(result.errorMessage ?? "Fixture request failed");
  return result.value;
}
const m = (name: string, args: object) => call("mutation", name, args);
const q = (name: string, args: object) => call("query", name, args);

test(
  "bounded registered cleanup is transactional, request-checked and idempotent",
  { skip: !base },
  async () => {
    const owner = await m("create", { pending: true });
    const other = await m("create", { pending: false });
    await m("seed", { userId: owner.userId, count: 205 });
    await m("seed", { userId: other.userId, count: 3 });
    await m("seedRetained", { userId: owner.userId });
    const args = {
      userId: owner.userId,
      expectedRequestedAt: owner.requestedAt,
    };
    await assert.rejects(
      m("batch", { ...args, expectedRequestedAt: owner.requestedAt + 1 }),
      /Matching deletion request/,
    );
    await assert.rejects(
      m("batch", {
        userId: other.userId,
        expectedRequestedAt: owner.requestedAt,
      }),
      /Matching deletion request/,
    );
    await assert.rejects(
      m("batch", { ...args, rollback: true }),
      /synthetic rollback/,
    );
    assert.deepEqual(await q("inspect", { userId: owner.userId }), {
      userExists: true,
      debits: 1,
      deliveries: 1,
      progress: null,
      handoffs: 205,
      identities: 205,
      anonymous: 1,
      global: 1,
      attempts: 1,
      receipts: 1,
    });
    const first = await m("batch", args);
    assert.equal(first.state, "in_progress");
    assert.equal(first.billingHandoffsDeleted, 100);
    assert.equal(first.telemetryIdentitiesDeleted, 100);
    await Promise.all([m("batch", args), m("batch", args)]);
    const finished = await m("batch", args);
    assert.equal(finished.state, "known_user_bound_cleared");
    assert.equal(finished.billingHandoffsDeleted, 205);
    assert.equal(finished.telemetryIdentitiesDeleted, 205);
    assert.deepEqual(await m("batch", args), finished);
    assert.deepEqual(await q("inspect", { userId: owner.userId }), {
      userExists: true,
      debits: 1,
      deliveries: 1,
      progress: finished,
      handoffs: 0,
      identities: 0,
      anonymous: 1,
      global: 1,
      attempts: 1,
      receipts: 1,
    });
    const retained = await q("inspect", { userId: other.userId });
    assert.equal(retained.handoffs, 3);
    assert.equal(retained.identities, 3);
    await m("reRequest", {
      userId: owner.userId,
      requestedAt: owner.requestedAt + 1,
    });
    await m("seed", { userId: owner.userId, count: 1 });
    await assert.rejects(m("batch", args), /Matching deletion request/);
    const newRequest = await m("batch", {
      ...args,
      expectedRequestedAt: owner.requestedAt + 1,
    });
    assert.equal(newRequest.requestedAt, owner.requestedAt + 1);
    assert.equal(newRequest.billingHandoffsDeleted, 1);
    assert.equal(newRequest.telemetryIdentitiesDeleted, 1);
  },
);
