import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.BILLING_HANDOFF_LOCAL_URL;
if (base && base !== "http://127.0.0.1:3540")
  throw new Error("The billing handoff fixture requires loopback port 3540.");
async function call(
  kind: "query" | "mutation",
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
    await assert.rejects(redeem(pending.code));
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
