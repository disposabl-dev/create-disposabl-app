import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { redirectSystemPath } from "../../../../apps/mobile/src/app/+native-intent";
import {
  handoffReturnClaim,
  safeBillingReturnUrl,
} from "../../../disposabl-kit/payments/checkout-attempt";

const require = createRequire(import.meta.url);
const configure = require("../../../../apps/mobile/app.config.js");
const base = require("../../../../apps/mobile/app.json").expo;

test("billing schemes are channel-specific and preserve existing sign-in schemes", () => {
  const old = process.env.DISPOSABL_MOBILE_CHANNEL;
  try {
    process.env.DISPOSABL_MOBILE_CHANNEL = "production";
    const prod = configure({ config: base });
    process.env.DISPOSABL_MOBILE_CHANNEL = "preview";
    const preview = configure({ config: base });
    const p = prod.scheme.find((s: string) =>
      s.startsWith("disposabl-billing-"),
    );
    const q = preview.scheme.find((s: string) =>
      s.startsWith("disposabl-billing-"),
    );
    assert.match(p, /^disposabl-billing-[a-f0-9]{12}-production$/);
    assert.match(q, /^disposabl-billing-[a-f0-9]{12}-preview$/);
    assert.notEqual(p, q);
    for (const config of [prod, preview]) {
      assert.ok(config.scheme.includes("mobile"));
      assert.ok(config.scheme.includes("disposabl-disposabl-dev"));
    }
    assert.equal(prod.extra.billingReturnChannel, "production");
    assert.equal(preview.extra.billingReturnChannel, "preview");
    assert.equal(
      redirectSystemPath({ path: `${p}://billing-return`, initial: false }),
      null,
    );
    assert.equal(
      redirectSystemPath({
        path: "disposabl-disposabl-dev://login?convexAuthCode=abc",
        initial: false,
      }),
      "disposabl-disposabl-dev://login?convexAuthCode=abc",
    );
    assert.equal(
      redirectSystemPath({
        path: `${p}://billing-return?other=1`,
        initial: false,
      }),
      `${p}://billing-return?other=1`,
    );
  } finally {
    if (old === undefined) delete process.env.DISPOSABL_MOBILE_CHANNEL;
    else process.env.DISPOSABL_MOBILE_CHANNEL = old;
  }
});

test("return claim and destination reject arbitrary inputs", () => {
  assert.equal(
    handoffReturnClaim(JSON.stringify({ returnClaim: "x".repeat(43) })),
    "x".repeat(43),
  );
  for (const value of [
    null,
    "garbage",
    JSON.stringify({ returnClaim: "https://evil.example" }),
  ])
    assert.equal(handoffReturnClaim(value), null);
  const good = "disposabl-billing-97f7be92f4c3-preview://billing-return";
  assert.equal(safeBillingReturnUrl(good), good);
  for (const value of [
    "https://evil.example",
    `${good}?token=123`,
    `${good}/other`,
    "mobile://login",
    "disposabl-billing-97f7be92f4c3-preview://login",
  ])
    assert.equal(safeBillingReturnUrl(value), null);
});
