import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = process.env.TELEMETRY_FIXTURE_URL;
if (url && !["http://127.0.0.1:3440", "http://localhost:3440"].includes(url))
  throw new Error(
    "Telemetry fixture requires the disposable loopback deployment on port 3440",
  );

async function call(name: string, args: object) {
  const response = await fetch(`${url}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: `fixture:${name}`, args, format: "json" }),
  });
  const result: any = await response.json();
  if (result.status !== "success")
    throw new Error(result.errorMessage ?? "Fixture mutation failed");
  return result.value;
}

test(
  "real Convex transactions bind each issued capability to at most one user",
  { skip: !url },
  async () => {
    // A fresh deployment must also serialize creation of its singleton bucket.
    const initial = Array.from({ length: 12 }, () => randomUUID());
    const issuedInitially = await Promise.all(
      initial.map((newHash) => call("claim", { newHash })),
    );
    assert.ok(issuedInitially.every((value) => value === false));
    assert.equal(
      await call("claim", { hash: initial[0], newHash: randomUUID() }),
      true,
    );
    // Separate races expose accidental acceptance of both competing claims.
    for (let i = 0; i < 12; i++) {
      const issued = randomUUID(),
        newA = randomUUID(),
        newB = randomUUID();
      const userA = randomUUID(),
        userB = randomUUID();
      assert.equal(await call("claim", { newHash: issued }), false);
      const [a, b] = await Promise.all([
        call("claim", { hash: issued, newHash: newA, userId: userA }),
        call("claim", { hash: issued, newHash: newB, userId: userB }),
      ]);
      assert.notEqual(a, b);
      const winner = a ? userA : userB;
      const loser = a ? userB : userA;
      const replacement = a ? newB : newA;
      assert.equal(
        await call("claim", {
          hash: issued,
          newHash: randomUUID(),
          userId: winner,
        }),
        true,
      );
      assert.equal(
        await call("claim", {
          hash: replacement,
          newHash: randomUUID(),
          userId: loser,
        }),
        true,
      );
      assert.equal(
        await call("claim", {
          hash: issued,
          newHash: randomUUID(),
          userId: loser,
        }),
        false,
      );
    }
    const fake = randomUUID(),
      rotated = randomUUID();
    assert.equal(
      await call("claim", { hash: fake, newHash: rotated, userId: "user-a" }),
      false,
    );
    assert.equal(
      await call("claim", {
        hash: rotated,
        newHash: randomUUID(),
        userId: "user-a",
      }),
      true,
    );
    const expired = randomUUID();
    assert.equal(await call("claim", { newHash: expired }), false);
    await call("expire", { hash: expired });
    assert.equal(
      await call("claim", {
        hash: expired,
        newHash: randomUUID(),
        userId: "user-a",
      }),
      false,
    );
    const owned = randomUUID();
    assert.equal(
      await call("claim", { newHash: owned, userId: "user-a" }),
      false,
    );
    assert.equal(
      await call("claim", { hash: owned, newHash: randomUUID() }),
      false,
    );
    // Concurrent requests with different fabricated IDs share one global budget.
    await call("setBudget", { tokens: 2 });
    const requests = Array.from({ length: 12 }, () => ({
      hash: randomUUID(),
      newHash: randomUUID(),
      userId: "attacker",
    }));
    const results = await Promise.all(
      requests.map((args) => call("claim", args)),
    );
    assert.equal(results.filter((value) => value === false).length, 2);
    assert.equal(results.filter((value) => value === null).length, 10);
    const issued = requests[results.indexOf(false)]!.newHash;
    assert.equal(
      await call("claim", {
        hash: issued,
        newHash: randomUUID(),
        userId: "attacker",
      }),
      true,
    );
    assert.equal(
      await call("claim", {
        hash: owned,
        newHash: randomUUID(),
        userId: "user-a",
      }),
      true,
    );
    assert.equal(await call("claim", { newHash: randomUUID() }), null);
  },
);
