import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connectionCallbackRedirect,
  mobileConnectionReturnUrl,
  readMobileConnectionCallback,
} from "../backend/convex/connections/mobile";

const state = `mobile_${"a".repeat(43)}`;
test("native provider callback forwards only one-time OAuth fields to a fixed app URL", () => {
  const response = connectionCallbackRedirect(
    new Request(
      `https://example.com/dashboard/connections?provider=convex&state=${state}&code=fixture&redirectTo=https://evil.example&access_token=private`,
    ),
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  const location = response.headers.get("Location")!;
  assert.ok(location.startsWith(mobileConnectionReturnUrl));
  assert.deepEqual(readMobileConnectionCallback(location), {
    state,
    provider: "convex",
    code: "fixture",
    installation: false,
  });
  assert.equal(new URL(location).searchParams.has("access_token"), false);
  assert.equal(new URL(location).searchParams.has("redirectTo"), false);
});
test("browser callbacks retain their query while native callbacks reject malformed state and destinations", () => {
  const response = connectionCallbackRedirect(
    new Request(
      "https://example.com/dashboard/connections?provider=github&code=connected&state=browser-state",
    ),
  );
  assert.equal(
    response.headers.get("Location"),
    "https://example.com/dashboard/connections/?provider=github&code=connected&state=browser-state",
  );
  assert.equal(
    connectionCallbackRedirect(
      new Request(
        "https://example.com/dashboard/connections?state=mobile_fake",
      ),
    ).status,
    400,
  );
  assert.throws(() =>
    readMobileConnectionCallback(
      `https://evil.example?state=${state}&code=x&provider=convex`,
    ),
  );
  assert.throws(() =>
    readMobileConnectionCallback(
      `${mobileConnectionReturnUrl}?state=${state}&provider=convex`,
    ),
  );
  assert.throws(() =>
    readMobileConnectionCallback(
      `${mobileConnectionReturnUrl}?state=${state}&error=access_denied`,
    ),
  );
});
test("GitHub installation callbacks preserve their pending native flow", () => {
  const response = connectionCallbackRedirect(
    new Request(
      `https://example.com/dashboard/connections?state=${state}&installation_id=123&setup_action=install`,
    ),
  );
  assert.equal(
    readMobileConnectionCallback(response.headers.get("Location")!)
      .installation,
    true,
  );
});

test("native connection lifecycle preserves one redemption and session ownership", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    [
      "test",
      new URL("./components/mobile-connections.test.mjs", import.meta.url)
        .pathname,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("native callback route remains available during session restoration", async () => {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    [
      "test",
      new URL(
        "./components/mobile-connections-navigation.test.mjs",
        import.meta.url,
      ).pathname,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
