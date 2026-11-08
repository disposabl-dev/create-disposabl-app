import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = process.env.BILLING_FIXTURE_URL;
if (url && !["http://127.0.0.1:3430", "http://localhost:3430"].includes(url))
  throw new Error(
    "Billing fixture requires the isolated loopback deployment on port 3430",
  );
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
const state = (userId: string) => call("state", { userId }, true);
const begin = (
  userId: string,
  purchase: "monthly" | "topup",
  requestId: string,
) => call("begin", { userId, purchase, requestId });
const resolve = (userId: string, requestId: string, outcome: string) =>
  call("resolve", {
    userId,
    requestId,
    outcome,
    evidence: "Fixture reconciliation evidence",
  });

test(
  "real Convex serializes checkout admission and holds unknown results",
  { skip: !url },
  async () => {
    const alice = randomUUID(),
      bob = randomUUID();
    assert.deepEqual(await state(alice), {
      unknown: false,
      monthlyPending: false,
      rows: [],
    });
    const ids = Array.from({ length: 12 }, () => randomUUID());
    const results = await Promise.allSettled(
      ids.map((id) => begin(alice, "monthly", id)),
    );
    assert.equal(
      results.filter((r) => r.status === "fulfilled" && r.value === null)
        .length,
      1,
    );
    for (const r of results)
      if (r.status === "rejected") assert.match(String(r.reason), /review/);
    let s = await state(alice);
    assert.equal(s.rows.length, 1);
    assert.equal(s.unknown, true);
    assert.equal(s.monthlyPending, true);
    const winner = s.rows[0].requestId;
    await assert.rejects(begin(alice, "monthly", winner), /review/);
    await assert.rejects(begin(alice, "monthly", randomUUID()), /review/);
    assert.equal(await begin(bob, "monthly", randomUUID()), null);
    assert.equal((await state(bob)).rows.length, 1);
    const topup = randomUUID();
    assert.equal(await begin(alice, "topup", topup), null);
    await call("finish", {
      userId: alice,
      purchase: "topup",
      requestId: topup,
      url: "https://example.test/topup",
    });
    assert.equal((await state(alice)).unknown, true);
    const nextTopup = randomUUID();
    assert.equal(await begin(alice, "topup", nextTopup), null);
    await resolve(alice, nextTopup, "not_charged");
    const link = "https://example.test/monthly";
    await call("finish", {
      userId: alice,
      purchase: "monthly",
      requestId: winner,
      url: link,
    });
    s = await state(alice);
    assert.equal(s.unknown, false);
    assert.equal(s.monthlyPending, true);
    assert.equal(await begin(alice, "monthly", winner), link);
    assert.deepEqual(
      await Promise.all(ids.map((id) => begin(alice, "monthly", id))),
      ids.map(() => link),
    );
    assert.equal((await state(alice)).rows.length, 3);
    await assert.rejects(
      resolve(alice, winner, "not_charged"),
      /completed, cancelled or expired/,
    );
    await resolve(alice, winner, "cancelled");
    s = await state(alice);
    assert.equal(s.monthlyPending, false);
    assert.equal(s.unknown, false);
    assert.deepEqual(await begin(alice, "monthly", winner), {
      retryAllowed: true,
    });
    assert.equal((await state(alice)).rows.length, 3);
  },
);

test(
  "resolution racing new monthly admissions permits at most one new reservation",
  { skip: !url },
  async () => {
    for (let round = 0; round < 8; round++) {
      const userId = randomUUID(),
        old = randomUUID();
      assert.equal(await begin(userId, "monthly", old), null);
      const candidates = Array.from({ length: 12 }, () => randomUUID());
      const results = await Promise.allSettled([
        resolve(userId, old, "not_charged"),
        ...candidates.map((id) => begin(userId, "monthly", id)),
      ]);
      assert.equal(results[0].status, "fulfilled");
      const admitted = results
        .slice(1)
        .filter((r) => r.status === "fulfilled" && r.value === null);
      assert.ok(admitted.length <= 1);
      for (const r of results.slice(1))
        if (r.status === "rejected") assert.match(String(r.reason), /review/);
      let s = await state(userId);
      assert.equal(
        s.rows.filter((r: any) => r.resolvedAt === undefined).length,
        admitted.length,
      );
      assert.equal(s.monthlyPending, admitted.length === 1);
      assert.deepEqual(await begin(userId, "monthly", old), {
        retryAllowed: true,
      });
      if (!admitted.length)
        assert.equal(await begin(userId, "monthly", randomUUID()), null);
      s = await state(userId);
      assert.equal(s.rows.length, 2);
      assert.equal(s.monthlyPending, true);
      assert.equal(s.unknown, true);
    }
  },
);
