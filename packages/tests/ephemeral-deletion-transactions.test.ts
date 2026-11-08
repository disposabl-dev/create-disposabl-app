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

test(
  "guarded claims cannot recreate identities during or after cleanup",
  { skip: !base },
  async () => {
    const owner = await m("create", { pending: false });
    const other = await m("create", { pending: false });
    const ownerId = owner.userId;
    assert.equal(
      await m("claim", { userId: ownerId, newHash: "combined-before" }),
      false,
    );
    assert.equal(
      (await q("identity", { hash: "combined-before" })).userId,
      ownerId,
    );
    assert.equal(await m("claim", { newHash: "combined-anonymous" }), false);
    assert.equal(
      await m("claim", { userId: other.userId, newHash: "combined-other" }),
      false,
    );
    await m("seed", { userId: ownerId, count: 105 });
    await m("reRequest", { userId: ownerId, requestedAt: owner.requestedAt });
    const args = { userId: ownerId, expectedRequestedAt: owner.requestedAt };
    const bucketBefore = await q("bucket", {});
    const attempts = await Promise.allSettled([
      m("batch", args),
      m("batch", args),
      m("batch", args),
      m("claim", { userId: ownerId, newHash: "combined-late-1" }),
      m("claim", {
        userId: ownerId,
        hash: "combined-anonymous",
        newHash: "combined-late-2",
      }),
      m("claim", {
        userId: ownerId,
        hash: "combined-before",
        newHash: "combined-late-3",
      }),
    ]);
    for (const result of attempts.slice(0, 3))
      assert.equal(result.status, "fulfilled");
    for (const result of attempts.slice(3)) {
      assert.equal(result.status, "rejected");
      if (result.status === "rejected")
        assert.match(
          String(result.reason),
          /Account deletion has been requested/,
        );
    }
    const completed = await m("batch", args);
    assert.equal(completed.state, "known_user_bound_cleared");
    assert.equal(completed.billingHandoffsDeleted, 105);
    assert.equal(completed.telemetryIdentitiesDeleted, 106);
    await assert.rejects(
      m("claim", { userId: ownerId, newHash: "combined-after" }),
      /Account deletion has been requested/,
    );
    assert.equal((await q("inspect", { userId: ownerId })).identities, 0);
    for (const hash of [
      "combined-before",
      "combined-late-1",
      "combined-late-2",
      "combined-late-3",
      "combined-after",
    ])
      assert.equal(await q("identity", { hash }), null);
    assert.equal(
      (await q("identity", { hash: "combined-anonymous" })).userId,
      undefined,
    );
    assert.equal(
      (await q("identity", { hash: "combined-other" })).userId,
      other.userId,
    );
    assert.deepEqual(await q("bucket", {}), bucketBefore);
  },
);
