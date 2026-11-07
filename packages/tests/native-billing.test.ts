import { test } from "node:test";
import assert from "node:assert/strict";
import { BillingSession } from "../disposabl-kit/mobile/billing/session";
import { monthlyPlanFromCustomer } from "../disposabl-kit/server/billing";

function deferred() {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((done) => {
      resolve = done;
    }),
    resolve: () => resolve(),
  };
}

test("monthly state includes scheduled plans and fails closed for unknown responses", () => {
  assert.equal(monthlyPlanFromCustomer({ subscriptions: [] }), false);
  for (const status of ["active", "scheduled"])
    assert.equal(
      monthlyPlanFromCustomer({
        subscriptions: [{ plan_id: "credits_monthly", status }],
      }),
      true,
    );
  assert.equal(monthlyPlanFromCustomer({}), null);
  assert.equal(
    monthlyPlanFromCustomer({ subscriptions: [{ planId: "credits_monthly" }] }),
    null,
  );
  assert.equal(
    monthlyPlanFromCustomer({
      subscriptions: [{ plan_id: "credits_monthly", status: "unknown" }],
    }),
    null,
  );
});

test("sign-out rejects queued work and never configures anonymous purchasing", async () => {
  let loaded = false;
  const session = new BillingSession(async () => {
    loaded = true;
    throw new Error("must not load");
  });
  const version = session.select("alice");
  const pending = session.run("alice", version, "public", async () => true);
  session.release("alice", version);
  await assert.rejects(pending, /account changed/);
  assert.equal(loaded, false);
});

test("an in-flight purchase finishes before identity switches and stale results are discarded", async () => {
  const started = deferred();
  const finish = deferred();
  const calls: string[] = [];
  const sdk = {
    configure: ({ appUserID }: { appUserID: string }) =>
      calls.push(`configure:${appUserID}`),
    logIn: async (id: string) => {
      calls.push(`login:${id}`);
    },
  };
  const session = new BillingSession(async () => sdk as never);
  const alice = session.select("alice");
  const purchase = session.run("alice", alice, "public", async () => {
    calls.push("purchase:alice");
    started.resolve();
    await finish.promise;
    return "receipt";
  });
  const rejected = assert.rejects(purchase, /account changed/);
  await started.promise;
  const bob = session.select("bob");
  const next = session.run("bob", bob, "public", async () => {
    calls.push("read:bob");
  });
  assert.deepEqual(calls, ["configure:alice", "purchase:alice"]);
  finish.resolve();
  await rejected;
  await next;
  assert.deepEqual(calls, [
    "configure:alice",
    "purchase:alice",
    "login:bob",
    "read:bob",
  ]);
  session.release("alice", alice);
  assert.equal(session.current("bob", bob), true);
});

test("identity changes during SDK login cannot execute the old account operation", async () => {
  const started = deferred();
  const finish = deferred();
  const sdk = {
    configure: () => {},
    logIn: async () => {
      started.resolve();
      await finish.promise;
    },
  };
  const session = new BillingSession(async () => sdk as never);
  await session.run("alice", session.select("alice"), "public", async () => {});
  let purchased = false;
  const pending = session.run(
    "bob",
    session.select("bob"),
    "public",
    async () => {
      purchased = true;
    },
  );
  const rejected = assert.rejects(pending, /account changed/);
  await started.promise;
  session.select(null);
  finish.resolve();
  await rejected;
  assert.equal(purchased, false);
});

test("a failed login cannot leave another user's identity trusted", async () => {
  const logins: string[] = [];
  const session = new BillingSession(
    async () =>
      ({
        configure: () => {},
        logIn: async (id: string) => {
          logins.push(id);
          if (id === "bob") throw new Error("lost response");
        },
      }) as never,
  );
  await session.run("alice", session.select("alice"), "public", async () => {});
  await assert.rejects(
    session.run("bob", session.select("bob"), "public", async () => {}),
    /lost response/,
  );
  await session.run("alice", session.select("alice"), "public", async () => {});
  assert.deepEqual(logins, ["bob", "alice"]);
});
