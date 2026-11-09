import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import project from "../../disposabl.json";

const selectedFeatures: readonly string[] = project.features;
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
      assert.equal(config.scheme[0], "disposabl-androidround10-preview");
      if (selectedFeatures.includes("payments")) {
        assert.equal(config.scheme.length, 2);
        assert.match(
          config.scheme[1],
          /^disposabl-billing-[a-f0-9]{12}-development$/,
        );
      } else assert.equal(config.scheme.length, 1);
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

test("Android bundle inputs include every public RevenueCat purchase setting", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const plugin = await readFile(
    resolve(import.meta.dirname, "../disposabl-kit/mobile/expo-plugin.cjs"),
    "utf8",
  );
  for (const name of [
    "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY",
    "EXPO_PUBLIC_REVENUECAT_ANDROID_MONTHLY_PRODUCT",
    "EXPO_PUBLIC_REVENUECAT_ANDROID_APP_ID",
    "EXPO_PUBLIC_REVENUECAT_ANDROID_TOPUP_PRODUCT",
    "EXPO_PUBLIC_REVENUECAT_OFFERING_ID",
  ])
    assert.match(
      plugin,
      new RegExp(`inputs\\.property\\([^\\n]*System\\.getenv\\("${name}"\\)`),
    );
});

test("isolated payment builds keep their billing return scheme", async () => {
  const { copyFile, mkdir, mkdtemp, writeFile } =
    await import("node:fs/promises");
  const { join, resolve } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(join(tmpdir(), "mobile-billing-config-"));
  await mkdir(join(root, "apps/mobile"), { recursive: true });
  await copyFile(
    resolve(import.meta.dirname, "../../apps/mobile/app.config.js"),
    join(root, "apps/mobile/app.config.cjs"),
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "synthetic" }),
  );
  const isolated = require(join(root, "apps/mobile/app.config.cjs"));
  for (const enabled of [false, true]) {
    await writeFile(
      join(root, "disposabl.json"),
      JSON.stringify({
        features: enabled ? ["authentication", "payments"] : ["authentication"],
      }),
    );
    withEnv(
      {
        EXPO_PUBLIC_E2E: "true",
        E2E_ANDROID_SCHEME: "isolated-test",
        DISPOSABL_MOBILE_CHANNEL: "preview",
      },
      () => {
        const result = isolated({ config: {} });
        assert.equal(result.scheme[0], "isolated-test");
        assert.equal(result.updates.enabled, false);
        if (enabled) {
          assert.match(
            result.scheme[1],
            /^disposabl-billing-[a-f0-9]{12}-preview$/,
          );
          assert.equal(result.extra.billingReturnChannel, "preview");
        } else {
          assert.equal(result.scheme.length, 1);
          assert.equal(result.extra?.billingReturnChannel, undefined);
        }
      },
    );
  }
});
