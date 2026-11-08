import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const configure = require("../../apps/mobile/app.config.js");
const network = require("../../apps/mobile/plugins/with-e2e-network.js");
const keys = [
  "EXPO_PUBLIC_E2E",
  "E2E_ANDROID_LOOPBACK",
  "EXPO_PUBLIC_CONVEX_URL",
  "EXPO_PUBLIC_CONVEX_SITE_URL",
  "CONVEX_URL",
  "CONVEX_SITE_URL",
  "E2E_ANDROID_APP_ID",
  "E2E_ANDROID_SCHEME",
  "DISPOSABL_MOBILE_CHANNEL",
] as const;

function withEnv(values: Record<string, string>, run: () => void) {
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, values);
  try {
    run();
  } finally {
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
}

test("production and E2E-off configurations retain default network security", () => {
  for (const e2e of [undefined, "false"])
    withEnv(
      {
        DISPOSABL_MOBILE_CHANNEL: "production",
        E2E_ANDROID_LOOPBACK: "true",
        E2E_ANDROID_APP_ID: "app.example.override",
        E2E_ANDROID_SCHEME: "override",
        ...(e2e ? { EXPO_PUBLIC_E2E: e2e } : {}),
      },
      () => {
        const config = configure({
          config: {
            android: { package: "app.example.production" },
            scheme: "original",
          },
        });
        assert.equal(config.android.package, "app.example.production");
        assert.ok(config.scheme.includes("original"));
        assert.ok(!config.scheme.includes("override"));
        assert.ok(!config.plugins.includes("./plugins/with-e2e-network.js"));
        assert.notEqual(config.updates.enabled, false);
        assert.ok(
          !config.plugins.some(
            (plugin: unknown) =>
              Array.isArray(plugin) && plugin[0] === "expo-dev-client",
          ),
        );
      },
    );
});

test("E2E loopback configuration has isolated identity, scheme, updates and network", () => {
  withEnv(
    {
      EXPO_PUBLIC_E2E: "true",
      E2E_ANDROID_LOOPBACK: "true",
      EXPO_PUBLIC_CONVEX_URL: "http://10.0.2.2:3310",
      E2E_ANDROID_APP_ID: "app.disposabl.androidround10.preview",
      E2E_ANDROID_SCHEME: "disposabl-androidround10-preview",
    },
    () => {
      const config = configure({ config: {} });
      assert.equal(
        config.android.package,
        "app.disposabl.androidround10.preview",
      );
      assert.deepEqual(config.scheme, ["disposabl-androidround10-preview"]);
      assert.equal(config.updates.enabled, false);
      assert.ok(config.plugins.includes("./plugins/with-e2e-network.js"));
      assert.equal(
        config.plugins.find(
          (plugin: unknown) =>
            Array.isArray(plugin) && plugin[0] === "expo-dev-client",
        )[1].addGeneratedScheme,
        false,
      );
      assert.doesNotThrow(() => network({}));
      for (const url of [
        "http://example.com:3310",
        "https://10.0.2.2:3310",
        "http://127.0.0.1:3310",
      ]) {
        process.env.EXPO_PUBLIC_CONVEX_URL = url;
        assert.throws(() => network({}));
      }
      process.env.EXPO_PUBLIC_CONVEX_URL = "http://10.0.2.2:3310";
      delete process.env.EXPO_PUBLIC_E2E;
      assert.throws(() => network({}));
    },
  );
});

test("E2E without loopback opt-in does not add cleartext policy", () => {
  withEnv({ EXPO_PUBLIC_E2E: "true" }, () => {
    assert.ok(
      !configure({ config: {} }).plugins.includes(
        "./plugins/with-e2e-network.js",
      ),
    );
  });
});
