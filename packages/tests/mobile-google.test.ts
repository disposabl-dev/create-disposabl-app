import { authReturnPath } from "../disposabl-kit/mobile/lib/auth-return";
import { test } from "node:test";
import projectFeatures from "../../disposabl.json";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import config from "../../disposabl.json";
import {
  mobileAuthCallback,
  mobileAuthRedirect,
  mobileAuthReturnUrl,
} from "../disposabl-kit/lib/mobile-auth";

test("mobile Google browser lifecycle", () => {
  const result = spawnSync(
    process.execPath,
    ["test", join(import.meta.dirname, "components/mobile-google.test.mjs")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("native OAuth forwards a one-time ticket to the app's fixed scheme only", () => {
  const response = mobileAuthRedirect(
    new Request(
      "https://example.convex.site/oauth/mobile?convexAuthCode=ticket&returnTo=https://attacker.test&access_token=secret",
    ),
  );
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    `${mobileAuthReturnUrl}?convexAuthCode=ticket`,
  );
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.deepEqual(mobileAuthCallback(response.headers.get("Location")!), {
    code: "ticket",
    error: null,
  });
});

test("native OAuth rejects empty responses and untrusted return destinations", () => {
  assert.equal(
    mobileAuthRedirect(new Request("https://example.convex.site/oauth/mobile"))
      .status,
    400,
  );
  for (const url of [
    "https://attacker.test/login?convexAuthCode=ticket",
    `${mobileAuthReturnUrl}/other?convexAuthCode=ticket`,
    `${mobileAuthReturnUrl}?convexAuthCode=ticket#extra`,
  ])
    assert.throws(() => mobileAuthCallback(url));
  const denied = mobileAuthRedirect(
    new Request(
      "https://example.convex.site/oauth/mobile?convexAuthError=access_denied&convexAuthCode=ignored",
    ),
  );
  assert.deepEqual(mobileAuthCallback(denied.headers.get("Location")!), {
    code: null,
    error: "access_denied",
  });
});

test(
  "native config registers the backend callback scheme and preserves custom schemes",
  {
    skip: !config.platforms.some(
      (platform) => platform === "ios" || platform === "android",
    ),
  },
  () => {
    const keys = [
      "CONVEX_URL",
      "CONVEX_SITE_URL",
      "EXPO_PUBLIC_CONVEX_URL",
      "EXPO_PUBLIC_CONVEX_SITE_URL",
    ];
    const saved = keys.map((key) => process.env[key]);
    try {
      for (const key of keys) delete process.env[key];
      const configure = createRequire(import.meta.url)(
        "../../apps/mobile/app.config.js",
      );
      const config = configure({ config: { scheme: ["custom", "another"] } });
      assert.deepEqual(config.scheme.slice(0, 3), [
        "custom",
        "another",
        new URL(mobileAuthReturnUrl).protocol.slice(0, -1),
      ]);
      if (config.scheme.length === 4)
        assert.match(
          config.scheme[3],
          /^disposabl-billing-[a-f0-9]{12}-[a-z][a-z0-9-]{0,62}$/,
        );
      assert.equal(
        config.scheme.length,
        projectFeatures.features.includes("payments") ? 4 : 3,
      );
    } finally {
      keys.forEach((key, index) => {
        if (saved[index] === undefined) delete process.env[key];
        else process.env[key] = saved[index];
      });
    }
  },
);

test("mobile authentication returns only to internal routes", () => {
  assert.equal(
    authReturnPath("/compose?exampleSlug=field"),
    "/compose?exampleSlug=field",
  );
  for (const value of [
    undefined,
    null,
    ["/compose"],
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/\nexample.com",
  ])
    assert.equal(authReturnPath(value), "/");
});
