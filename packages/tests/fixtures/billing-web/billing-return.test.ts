import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { redirectSystemPath } from "../../../../apps/mobile/src/app/+native-intent";
import {
  handoffReturnClaim,
  safeBillingReturnUrl,
} from "../../../disposabl-kit/payments/checkout-attempt";

const require = createRequire(import.meta.url);
const base = require("../../../../apps/mobile/app.json").expo;

test("billing schemes are channel-specific and preserve existing sign-in schemes", () => {
  const old = process.env.DISPOSABL_MOBILE_CHANNEL;
  const temp = mkdtempSync(join(tmpdir(), "billing-config-"));
  mkdirSync(join(temp, "apps/mobile"), { recursive: true });
  copyFileSync(
    require.resolve("../../../../apps/mobile/app.config.js"),
    join(temp, "apps/mobile/app.config.cjs"),
  );
  writeFileSync(
    join(temp, "package.json"),
    JSON.stringify({ name: "disposabl-dev" }),
  );
  const select = (features: string[]) =>
    writeFileSync(join(temp, "disposabl.json"), JSON.stringify({ features }));
  const configure = require(join(temp, "apps/mobile/app.config.cjs"));
  try {
    select(["authentication"]);
    process.env.DISPOSABL_MOBILE_CHANNEL = "production";
    const off = configure({ config: base });
    assert.deepEqual(off.scheme, ["mobile", "disposabl-disposabl-dev"]);
    assert.equal(off.extra?.billingReturnChannel, undefined);
    select(["authentication", "payments"]);
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
    select(["authentication"]);
    const disabledAgain = configure({ config: base });
    assert.deepEqual(disabledAgain.scheme, off.scheme);
    assert.equal(disabledAgain.extra?.billingReturnChannel, undefined);
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
    rmSync(temp, { recursive: true, force: true });
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
