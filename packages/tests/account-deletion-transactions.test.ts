import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = process.env.ACCOUNT_DELETION_FIXTURE_URL;
if (url && !["http://127.0.0.1:3540", "http://localhost:3540"].includes(url))
  throw new Error("Account deletion fixture requires loopback port 3540");
async function call(name: string, args: object, query = false): Promise<any> {
  const response = await fetch(`${url}/api/${query ? "query" : "mutation"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: `fixture:${name}`, args, format: "json" }),
  });
  const result = (await response.json()) as any;
  if (result.status !== "success")
    throw new Error(result.errorMessage ?? JSON.stringify(result));
  return result.value;
}
test(
  "requests are authenticated, idempotent and isolated under concurrent calls",
  { skip: !url },
  async () => {
    const alice = await call("create", { label: randomUUID() });
    const bob = await call("create", { label: randomUUID() });
    await assert.rejects(
      call("request", { userId: null, confirmation: "DELETE" }),
      /Sign in/,
    );
    await assert.rejects(
      call("request", { userId: alice, confirmation: "delete" }),
      /Type DELETE/,
    );
    assert.equal(await call("status", { userId: alice }, true), null);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        call("request", { userId: alice, confirmation: "DELETE" }),
      ),
    );
    assert.ok(
      results.every(
        (x) =>
          x.status === "requested" &&
          x.requestedAt === results[0].requestedAt &&
          x.reference === results[0].reference,
      ),
    );
    assert.deepEqual(await call("status", { userId: alice }, true), results[0]);
    assert.equal(await call("status", { userId: bob }, true), null);
    await assert.rejects(
      call("requestRollback", { userId: bob }),
      /synthetic receipt rollback/,
    );
    assert.equal(await call("status", { userId: bob }, true), null);
    assert.ok(
      !(await call("receiptQueue", {}, true)).page.some(
        (receipt: any) => receipt.ownerId === bob,
      ),
    );
    const otherReceipt = await call("request", {
      userId: bob,
      confirmation: "DELETE",
    });
    assert.notEqual(otherReceipt.reference, results[0].reference);
    assert.equal(await call("pending", { userId: alice }, true), true);
    assert.equal(await call("pending", { userId: bob }, true), true);
    const queue = await call("queue", {}, true);
    assert.equal(
      queue.page.filter((row: any) => row.userId === alice).length,
      1,
    );
    assert.equal(queue.page.filter((row: any) => row.userId === bob).length, 1);
  },
);

test(
  "deletion and work admission serialize and later work is fenced",
  { skip: !url },
  async () => {
    const userId = await call("create", { label: randomUUID() });
    const results = await Promise.allSettled([
      call("request", { userId, confirmation: "DELETE" }),
      call("attemptWork", { userId }),
    ]);
    assert.equal(results[0].status, "fulfilled");
    await assert.rejects(
      call("attemptWork", { userId }),
      /Account deletion has been requested/,
    );
    assert.equal((await call("status", { userId }, true)).status, "requested");
  },
);

test(
  "stop attempts serialize, preserve uncertainty and require an explicit retry",
  { skip: !url },
  async () => {
    const userId = await call("create", { label: randomUUID() });
    await call("request", { userId, confirmation: "DELETE" });
    const claims = await Promise.all([
      call("claimStop", { userId, token: "first" }),
      call("claimStop", { userId, token: "second" }),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    const token = claims[0] ? "first" : "second";
    assert.equal(
      await call("finishStop", {
        userId,
        token: "wrong",
        outcome: "archived_observed",
      }),
      false,
    );
    await call("expireStop", { userId });
    assert.equal(
      await call("finishStop", { userId, token, outcome: "archived_observed" }),
      false,
    );
    let queue = await call("queue", {}, true);
    assert.equal(
      queue.page.find((row: any) => row.userId === userId).stop,
      "unknown",
    );
    assert.equal(await call("claimStop", { userId, token: "retry" }), true);
    assert.equal(
      await call("claimStop", { userId, token: "duplicate" }),
      false,
    );
    assert.equal(
      await call("finishStop", { userId, token, outcome: "archived_observed" }),
      false,
    );
    assert.equal(
      await call("finishStop", { userId, token: "retry", outcome: "failed" }),
      true,
    );
    assert.equal(await call("claimStop", { userId, token: "final" }), true);
    assert.equal(
      await call("finishStop", {
        userId,
        token: "final",
        outcome: "archived_observed",
      }),
      true,
    );
    queue = await call("queue", {}, true);
    assert.equal(
      queue.page.find((row: any) => row.userId === userId).stop,
      "archived_observed",
    );
    assert.equal(await call("claimStop", { userId, token: "again" }), true);
    assert.equal((await call("status", { userId }, true)).status, "requested");
  },
);

test(
  "late provider callbacks and file registration cannot commit after a deletion request",
  { skip: !url },
  async () => {
    const userId = await call("create", { label: randomUUID() });
    const other = await call("create", { label: randomUUID() });
    await call("saveConnection", { userId, token: "old" });
    await call("beginConnection", { userId });
    await call("request", { userId, confirmation: "DELETE" });
    for (const [name, args] of [
      ["saveConnection", { userId, token: "late" }],
      ["refreshConnection", { userId, previous: "old", next: "new" }],
      ["selectConnection", { userId, token: "old" }],
      ["githubConnection", { userId }],
      ["beginConnection", { userId }],
      ["consumeConnection", { userId }],
      ["registerFile", { userId }],
    ] as const)
      await assert.rejects(call(name, args), /Account deletion/);
    assert.equal(
      await call("refreshConnection", { userId, previous: "old", next: "old" }),
      false,
    );
    const rows = await call("owned", { userId }, true);
    assert.equal(rows.connections.length, 1);
    assert.equal(rows.connections[0].token, "old");
    assert.equal(rows.github.length, 0);
    assert.equal(rows.files.length, 0);
    await call("saveConnection", { userId: other, token: "ok" });
    await call("registerFile", { userId: other });
    const unaffected = await call("owned", { userId: other }, true);
    assert.equal(unaffected.connections.length, 1);
    assert.equal(unaffected.files.length, 1);
  },
);

test(
  "registration racing a request serializes and no later registration succeeds",
  { skip: !url },
  async () => {
    const userId = await call("create", { label: randomUUID() });
    const results = await Promise.allSettled([
      call("request", { userId, confirmation: "DELETE" }),
      call("registerFile", { userId }),
    ]);
    assert.equal(results[0].status, "fulfilled");
    await assert.rejects(call("registerFile", { userId }), /Account deletion/);
    const rows = await call("owned", { userId }, true);
    assert.equal(rows.files.length, results[1].status === "fulfilled" ? 1 : 0);
  },
);

test(
  "receipts backfill legacy requests and survive synthetic user removal",
  { skip: !url },
  async () => {
    const owner = await call("create", { label: randomUUID() });
    const other = await call("create", { label: randomUUID() });
    await assert.rejects(call("ensureReceipt", { userId: null }), /Sign in/);
    await assert.rejects(call("ensureReceipt", { userId: other }), /not found/);
    await call("legacyRequest", { userId: owner, requestedAt: 123456 });
    assert.deepEqual(await call("status", { userId: owner }, true), {
      status: "requested",
      requestedAt: 123456,
      reference: null,
    });
    const receipts = await Promise.all(
      Array.from({ length: 5 }, () => call("ensureReceipt", { userId: owner })),
    );
    assert.ok(
      receipts.every(
        (receipt) =>
          receipt.reference === receipts[0].reference &&
          receipt.requestedAt === 123456,
      ),
    );
    const ref = receipts[0].reference;
    assert.equal(await call("status", { userId: other }, true), null);
    assert.deepEqual(await call("lookupReceipt", { reference: ref }, true), {
      reference: ref,
      ownerId: owner,
      requestedAt: 123456,
    });
    await call("removeUser", { userId: owner });
    assert.equal(await call("status", { userId: owner }, true), null);
    assert.deepEqual(await call("lookupReceipt", { reference: ref }, true), {
      reference: ref,
      ownerId: owner,
      requestedAt: 123456,
    });
    assert.ok(
      (await call("receiptQueue", {}, true)).page.some(
        (receipt: any) => receipt.reference === ref,
      ),
    );
  },
);
