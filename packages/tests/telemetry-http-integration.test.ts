import { assertOwnedSdkBackend } from "./helpers/sdk-auth/ownership";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

const base = process.env.TELEMETRY_HTTP_FIXTURE_URL;
if (base && base !== "http://127.0.0.1:3540")
  throw new Error("Expected owned loopback backend");
const site = "http://127.0.0.1:3541";
async function invoke(
  kind: "mutation" | "query",
  path: string,
  args: object,
  token?: string,
): Promise<any> {
  const response = await fetch(`${base}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const result = (await response.json()) as any;
  if (result.status !== "success")
    throw new Error("Synthetic fixture call failed");
  return result.value;
}
async function account() {
  const username = `telemetry${randomUUID().replaceAll("-", "")}`;
  const password = `Fixture-${randomUUID()}!`;
  assert.equal(
    (
      await invoke("mutation", "auth:signUpWithUsernamePassword", {
        username,
        password,
      })
    ).status,
    "complete",
  );
  const signed = await invoke("mutation", "auth:signInWithUsernamePassword", {
    username,
    password,
  });
  assert.equal(signed.status, "complete");
  return signed.tokens.accessToken as string;
}
async function post(path: string, body: object, token?: string) {
  return fetch(`${site}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
async function identity(id: string) {
  const hash = createHash("sha256")
    .update(`disposabl:anonymous-capability:${id}`)
    .digest("hex");
  return invoke("query", "fixture:identity", { hash });
}

test(
  "real HTTP page and bootstrap share one link with real auth and disabled production transport",
  { skip: !base },
  async () => {
    assertOwnedSdkBackend({
      markerVariable: "TELEMETRY_HTTP_OWNERSHIP_FILE",
      ports: [3540, 3541],
      claimDirectory: ".telemetry-http-claimed",
    });
    const firstToken = await account();
    const secondToken = await account();
    const page = { platform: "web", page: "home" };
    assert.equal((await post("/production/page", page)).status, 204);
    assert.equal((await post("/production/bootstrap", {})).status, 204);
    const anonymous = (await (
      await post("/fixture/page?private=private-marker", {
        ...page,
        extra: "private-marker",
      })
    ).json()) as any;
    const before = await identity(anonymous.anonymousId);
    assert.equal(before.userId, undefined);
    assert.doesNotMatch(JSON.stringify(before), /private-marker/);
    const bootResponse = await post(
      "/fixture/bootstrap",
      { anonymousId: anonymous.anonymousId },
      firstToken,
    );
    assert.equal(bootResponse.status, 200);
    const boot = (await bootResponse.json()) as any;
    assert.equal(boot.anonymousId, anonymous.anonymousId);
    assert.equal(boot.identified, true);
    const linked = await identity(anonymous.anonymousId);
    assert.ok(linked.link?.eventId);
    assert.equal(linked.link.distinct, boot.distinctId);
    await post(
      "/fixture/page",
      { ...page, anonymousId: anonymous.anonymousId },
      firstToken,
    );
    const repeated = await identity(anonymous.anonymousId);
    assert.equal(repeated.link.eventId, linked.link.eventId);
    assert.equal(repeated.link.createdAt, linked.link.createdAt);
    const fresh = (await (await post("/fixture/bootstrap", {})).json()) as any;
    const pageLogin = await post(
      "/fixture/page",
      { ...page, anonymousId: fresh.anonymousId },
      firstToken,
    );
    assert.equal(pageLogin.status, 200);
    const secondLink = await identity(fresh.anonymousId);
    assert.ok(secondLink.link?.eventId);
    await post(
      "/fixture/bootstrap",
      { anonymousId: fresh.anonymousId },
      firstToken,
    );
    assert.equal(
      (await identity(fresh.anonymousId)).link.eventId,
      secondLink.link.eventId,
    );
    const switched = (await (
      await post(
        "/fixture/bootstrap",
        { anonymousId: anonymous.anonymousId },
        secondToken,
      )
    ).json()) as any;
    assert.notEqual(switched.anonymousId, anonymous.anonymousId);
    assert.notEqual(switched.distinctId, boot.distinctId);
    assert.equal(
      (await identity(anonymous.anonymousId)).link.eventId,
      linked.link.eventId,
    );
    assert.equal(
      (await post("/fixture/bootstrap", { userId: "spoof" }, firstToken))
        .status,
      400,
    );
    assert.equal(
      (await post("/fixture/bootstrap", {}, "invalid-token")).status,
      401,
    );
    await invoke(
      "mutation",
      "users/index:requestDeletion",
      { confirmation: "DELETE" },
      firstToken,
    );
    assert.equal(
      (
        await post(
          "/fixture/bootstrap",
          { anonymousId: fresh.anonymousId },
          firstToken,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await post(
          "/fixture/page",
          { ...page, anonymousId: fresh.anonymousId },
          firstToken,
        )
      ).status,
      401,
    );
  },
);
