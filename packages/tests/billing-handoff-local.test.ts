import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.BILLING_HANDOFF_LOCAL_URL;
if (base && !["http://127.0.0.1:3540", "http://127.0.0.1:3530"].includes(base))
  throw new Error(
    "The billing handoff fixture requires loopback port 3530 or 3540.",
  );
async function call(
  kind: "query" | "mutation" | "action",
  path: string,
  args: object,
  token?: string,
) {
  const response = await fetch(`${base}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path, args, format: "json" }),
    signal: AbortSignal.timeout(15000),
  });
  const result = (await response.json()) as {
    status: string;
    value?: any;
    errorMessage?: string;
  };
  if (result.status !== "success") {
    if (
      result.errorMessage?.includes(
        "Account deletion has been requested or this account no longer exists",
      )
    )
      throw new Error("billing ineligible");
    if (result.errorMessage?.includes("Source session is no longer active."))
      throw new Error("source session inactive");
    if (result.errorMessage?.includes("Please sign in to use payments."))
      throw new Error("billing authentication required");
    throw new Error(`${path} rejected`);
  }
  return result.value;
}
async function preflight() {
  assert.equal(await call("query", "fixtureBillingHandoff:ready", {}), true);
}
async function signup() {
  const username = `handoff${randomUUID().replaceAll("-", "")}`;
  const password = `Fixture-${randomUUID()}!`;
  const result = await call("mutation", "auth:signUpWithUsernamePassword", {
    username,
    password,
  });
  assert.equal(result.status, "complete");
  return { username, password, tokens: result.tokens };
}
async function create(token: string, channel = "production") {
  const value = await call(
    "mutation",
    "billingHandoff:create",
    { purchase: "topup", returnChannel: channel },
    token,
  );
  const url = new URL(value.url);
  assert.equal(url.origin, "https://fixture.invalid");
  assert.equal(url.pathname, "/billing-login");
  const code = url.hash.slice(1);
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  return { code, userId: value.userId };
}
const inspect = (code: string) =>
  call("query", "billingHandoff:inspect", { code });
const redeem = (code: string) =>
  call("mutation", "billingHandoff:redeem", { code });
const target = (code: string, token?: string) =>
  call("query", "billingHandoff:returnTarget", { code }, token);
const expire = (code: string, field: "handoff" | "return") =>
  call("mutation", "fixtureBillingHandoff:expire", { code, field });

test(
  "real auth exchange binds a single-use handoff return to its browser session",
  { skip: !base },
  async () => {
    await preflight();
    const owner = await signup();
    const other = await signup();
    await assert.rejects(create(""));
    const handoff = await create(owner.tokens.accessToken);
    assert.deepEqual(await inspect(handoff.code), {
      name: `@${owner.username}`,
    });
    assert.equal(await target(handoff.code, owner.tokens.accessToken), null);
    const browser = await redeem(handoff.code);
    assert.equal(browser.userId, handoff.userId);
    assert.equal(browser.purchase, "topup");
    assert.equal(browser.returnClaim, handoff.code);
    assert.equal(
      await call("query", "auth:isAuthenticated", {}, browser.accessToken),
      true,
    );
    const current = await call(
      "query",
      "users/index:current",
      {},
      browser.accessToken,
    );
    assert.equal(current.username, owner.username);
    const returned = await target(handoff.code, browser.accessToken);
    assert.match(
      returned.url,
      /^disposabl-billing-[a-f0-9]{12}-production:\/\/billing-return$/,
    );
    assert.equal(await target(handoff.code, owner.tokens.accessToken), null);
    assert.equal(await target(handoff.code, other.tokens.accessToken), null);
    const fresh = await call("mutation", "auth:signInWithUsernamePassword", {
      username: owner.username,
      password: owner.password,
    });
    assert.equal(fresh.status, "complete");
    assert.equal(await target(handoff.code, fresh.tokens.accessToken), null);
    assert.equal(await target(handoff.code), null);
    assert.equal(await inspect(handoff.code), null);
    await assert.rejects(redeem(handoff.code));
    await expire(handoff.code, "return");
    assert.equal(await target(handoff.code, browser.accessToken), null);
  },
);

test(
  "real handoff rejects expiry, malformed return channels and revoked source sessions",
  { skip: !base },
  async () => {
    await preflight();
    const owner = await signup();
    const expired = await create(owner.tokens.accessToken);
    await expire(expired.code, "handoff");
    assert.equal(await inspect(expired.code), null);
    await assert.rejects(redeem(expired.code));
    assert.equal(await inspect("bad-code"), null);
    assert.equal(await target("bad-code", owner.tokens.accessToken), null);
    for (const channel of [
      "preview://evil",
      "unknown",
      "Preview",
      "production\npreview",
    ]) {
      const handoff = await create(owner.tokens.accessToken, channel);
      const browser = await redeem(handoff.code);
      assert.equal(browser.returnClaim, null);
      assert.equal(await target(handoff.code, browser.accessToken), null);
    }
    const pending = await create(owner.tokens.accessToken);
    await call(
      "mutation",
      "auth:signOut",
      { refreshToken: owner.tokens.refreshToken },
      owner.tokens.accessToken,
    );
    assert.equal(await inspect(pending.code), null);
    await assert.rejects(redeem(pending.code), /source session inactive/);
  },
);

const beginAttempt = (userId: string, requestId: string) =>
  call("mutation", "fixtureBillingHandoff:beginAttempt", { userId, requestId });
const hasAttempt = (userId: string, requestId: string) =>
  call("query", "fixtureBillingHandoff:hasAttempt", { userId, requestId });

test(
  "actual deletion request fences create, existing handoff and registered attempt",
  { skip: !base },
  async () => {
    await preflight();
    const owner = await signup();
    const unaffected = await signup();
    const handoff = await create(owner.tokens.accessToken);
    assert.deepEqual(await inspect(handoff.code), {
      name: `@${owner.username}`,
    });
    const existing = randomUUID();
    assert.equal(await beginAttempt(handoff.userId, existing), null);
    assert.equal(await hasAttempt(handoff.userId, existing), true);
    const receipt = await call(
      "mutation",
      "users/index:requestDeletion",
      { confirmation: "DELETE" },
      owner.tokens.accessToken,
    );
    assert.equal(receipt.status, "requested");
    await assert.rejects(
      create(owner.tokens.accessToken),
      /billing ineligible/,
    );
    assert.equal(await inspect(handoff.code), null);
    await assert.rejects(redeem(handoff.code), /billing ineligible/);
    await assert.rejects(
      beginAttempt(handoff.userId, existing),
      /billing ineligible/,
    );
    assert.equal(await hasAttempt(handoff.userId, existing), true);
    const blocked = randomUUID();
    await assert.rejects(
      beginAttempt(handoff.userId, blocked),
      /billing ineligible/,
    );
    assert.equal(await hasAttempt(handoff.userId, blocked), false);

    const valid = await create(unaffected.tokens.accessToken);
    assert.deepEqual(await inspect(valid.code), {
      name: `@${unaffected.username}`,
    });
    const browser = await redeem(valid.code);
    const returned = await target(valid.code, browser.accessToken);
    assert.match(
      returned.url,
      /^disposabl-billing-[a-f0-9]{12}-production:\/\/billing-return$/,
    );
    const allowed = randomUUID();
    assert.equal(await beginAttempt(valid.userId, allowed), null);
    assert.equal(await hasAttempt(valid.userId, allowed), true);
  },
);

test(
  "missing synthetic owner fails closed before handoff or registered attempt",
  { skip: !base },
  async () => {
    await preflight();
    const owner = await signup();
    const handoff = await create(owner.tokens.accessToken);
    assert.deepEqual(await inspect(handoff.code), {
      name: `@${owner.username}`,
    });
    const existing = randomUUID();
    assert.equal(await beginAttempt(handoff.userId, existing), null);
    assert.equal(await hasAttempt(handoff.userId, existing), true);
    await call("mutation", "fixtureBillingHandoff:removeOwner", {
      userId: handoff.userId,
    });
    await assert.rejects(
      create(owner.tokens.accessToken),
      /billing ineligible/,
    );
    assert.equal(await inspect(handoff.code), null);
    await assert.rejects(redeem(handoff.code), /billing ineligible/);
    await assert.rejects(
      beginAttempt(handoff.userId, existing),
      /billing ineligible/,
    );
    assert.equal(await hasAttempt(handoff.userId, existing), true);
    const blocked = randomUUID();
    await assert.rejects(
      beginAttempt(handoff.userId, blocked),
      /billing ineligible/,
    );
    assert.equal(await hasAttempt(handoff.userId, blocked), false);
  },
);

test(
  "redeemed browser remains A after source logout and B sign-in, then revokes",
  { skip: !base },
  async () => {
    await preflight();
    const sourceA = await signup();
    const pending = await create(sourceA.tokens.accessToken);
    assert.equal(
      await call("query", "fixtureBillingHandoff:sessionCount", {
        userId: pending.userId,
      }),
      1,
    );
    await call(
      "mutation",
      "auth:signOut",
      { refreshToken: sourceA.tokens.refreshToken },
      sourceA.tokens.accessToken,
    );
    assert.equal(
      await call("query", "fixtureBillingHandoff:sessionCount", {
        userId: pending.userId,
      }),
      0,
    );
    await assert.rejects(redeem(pending.code), /source session inactive/);
    assert.equal(
      await call("query", "fixtureBillingHandoff:sessionCount", {
        userId: pending.userId,
      }),
      0,
    );

    const source = await signup();
    const handoff = await create(source.tokens.accessToken);
    const browser = await redeem(handoff.code);
    assert.equal(browser.userId, handoff.userId);
    await call(
      "mutation",
      "auth:signOut",
      { refreshToken: source.tokens.refreshToken },
      source.tokens.accessToken,
    );
    const other = await signup();
    const current = await call(
      "query",
      "users/index:current",
      {},
      browser.accessToken,
    );
    const otherCurrent = await call(
      "query",
      "users/index:current",
      {},
      other.tokens.accessToken,
    );
    assert.equal(current.username, source.username);
    assert.equal(otherCurrent.username, other.username);
    assert.notEqual(current.id, otherCurrent.id);
    const checkout = await call(
      "action",
      "billing:checkout",
      { purchase: "topup", requestId: randomUUID() },
      browser.accessToken,
    );
    assert.equal(checkout.url, "http://127.0.0.1:3549/local-test-checkout");
    const evidence = await call(
      "query",
      "fixtureBillingCheckout:evidence",
      {},
      browser.accessToken,
    );
    assert.equal(evidence.userId, handoff.userId);
    assert.equal(evidence.calls.length, 1);
    assert.equal(evidence.calls[0].userId, handoff.userId);
    assert.notEqual(evidence.calls[0].userId, otherCurrent.id);
    assert.equal(
      await call("query", "fixtureBillingHandoff:sessionCount", {
        userId: handoff.userId,
      }),
      1,
    );
    const allBefore = await call(
      "query",
      "fixtureBillingHandoff:checkoutRows",
      {},
    );
    await call(
      "mutation",
      "auth:signOut",
      { refreshToken: browser.refreshToken },
      browser.accessToken,
    );
    assert.equal(
      await call("query", "fixtureBillingHandoff:sessionCount", {
        userId: handoff.userId,
      }),
      0,
    );
    await assert.rejects(
      call(
        "action",
        "billing:checkout",
        { purchase: "topup", requestId: randomUUID() },
        browser.accessToken,
      ),
      /billing authentication required/,
    );
    assert.deepEqual(
      await call("query", "fixtureBillingHandoff:checkoutRows", {}),
      allBefore,
    );
    const freshA = await call("mutation", "auth:signInWithUsernamePassword", {
      username: source.username,
      password: source.password,
    });
    assert.equal(freshA.status, "complete");
    const after = await call(
      "query",
      "fixtureBillingCheckout:evidence",
      {},
      freshA.tokens.accessToken,
    );
    assert.equal(after.calls.length, 1);
    assert.equal(after.attempts.length, evidence.attempts.length);
  },
);
