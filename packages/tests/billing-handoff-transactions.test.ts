import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = process.env.BILLING_HANDOFF_FIXTURE_URL;
if (url && !["http://127.0.0.1:3530", "http://localhost:3530"].includes(url))
  throw new Error(
    "Billing handoff fixture requires isolated loopback port 3530",
  );
async function call(name: string, args: object, query = false): Promise<any> {
  const response = await fetch(`${url}/api/${query ? "query" : "mutation"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: `fixture:${name}`, args, format: "json" }),
  });
  const result = (await response.json()) as any;
  if (result.status !== "success")
    throw new Error(result.errorMessage ?? "Fixture call failed");
  return result.value;
}
const create = async (
  user: string,
  channel: string | undefined,
  enabled = true,
) => {
  const result = await call("create", {
    user,
    session: `source-${user}`,
    purchase: "topup",
    ...(channel === undefined ? {} : { channel }),
    enabled,
  });
  return new URL(result.url).hash.slice(1);
};
const redeem = (code: string, user: string, session: string) =>
  call("redeem", { code, user, session });
const target = (code: string, user: string, session: string, allowed = true) =>
  call("target", { code, user, session, allowed }, true);

test(
  "real Convex serializes single-use handoff redemption and binds return to browser session",
  { skip: !url },
  async () => {
    const user = `fixture-${randomUUID()}`;
    const code = await create(user, "preview");
    const sessions = Array.from(
      { length: 16 },
      (_, i) => `browser-${i}-${randomUUID()}`,
    );
    const results = await Promise.allSettled(
      sessions.map((session) => redeem(code, user, session)),
    );
    const winners = results.flatMap((r, i) =>
      r.status === "fulfilled"
        ? [{ value: r.value, session: sessions[i]! }]
        : [],
    );
    assert.equal(winners.length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 15);
    for (const result of results)
      if (result.status === "rejected")
        assert.match(String(result.reason), /expired/);
    assert.equal(winners[0]!.value.purchase, "topup");
    assert.equal(winners[0]!.value.returnClaim, code);
    const opened = await target(code, user, winners[0]!.session);
    assert.match(
      opened.url,
      /^disposabl-billing-[a-f0-9]{12}-preview:\/\/billing-return$/,
    );
    assert.equal(await target(code, user, `different-${randomUUID()}`), null);
    assert.equal(
      await target(code, `other-${randomUUID()}`, winners[0]!.session),
      null,
    );
    assert.equal(await target(code, user, winners[0]!.session, false), null);
    await assert.rejects(redeem(code, user, winners[0]!.session), /expired/);
    await call("expire", { code, field: "return" });
    assert.equal(await target(code, user, winners[0]!.session), null);
  },
);

test(
  "real Convex enforces expiry and safely falls back for disabled or malformed channels",
  { skip: !url },
  async () => {
    const user = `fixture-${randomUUID()}`;
    await assert.rejects(create(user, "preview", false), /unavailable/);
    const expired = await create(user, "production");
    await call("expire", { code: expired, field: "handoff" });
    await assert.rejects(redeem(expired, user, "browser"), /expired/);
    await assert.rejects(redeem("invalid#code", user, "browser"), /expired/);
    assert.equal(await target("invalid#code", user, "browser"), null);
    for (const channel of [
      undefined,
      "preview://evil",
      "unknown",
      "Preview",
      "production\npreview",
    ]) {
      const code = await create(user, channel);
      const result = await redeem(code, user, "browser");
      assert.equal(result.returnClaim, null);
      assert.equal(await target(code, user, "browser"), null);
      await assert.rejects(redeem(code, user, "browser"), /expired/);
    }
    const code = await create(user, "production");
    const result = await redeem(code, user, "browser");
    assert.equal(result.returnClaim, code);
    assert.match(
      (await target(code, user, "browser")).url,
      /-production:\/\/billing-return$/,
    );
  },
);
