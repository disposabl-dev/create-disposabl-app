import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const configure = require("../../apps/mobile/app.config.js");
const mobile = require("../../apps/mobile/package.json");

function isolatedConfig(config: object) {
  const keys = [
    "CONVEX_URL",
    "CONVEX_SITE_URL",
    "EXPO_PUBLIC_CONVEX_URL",
    "EXPO_PUBLIC_CONVEX_SITE_URL",
  ];
  const saved = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    return configure(config);
  } finally {
    for (const [index, key] of keys.entries()) {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    }
  }
}

test("iOS build properties constrain the Expo Updates reachability pod", () => {
  const config = isolatedConfig({ config: { plugins: ["existing-plugin"] } });
  const properties = config.plugins.filter(
    (plugin: unknown) =>
      Array.isArray(plugin) && plugin[0] === "expo-build-properties",
  );
  assert.deepEqual(properties, [
    [
      "expo-build-properties",
      {
        ios: { extraPods: [{ name: "ReachabilitySwift", version: "5.2.3" }] },
      },
    ],
  ]);
  assert.ok(config.plugins.includes("existing-plugin"));
  assert.ok(config.plugins.includes("./plugins/with-android-signing.js"));
  assert.equal(mobile.dependencies["expo-build-properties"], "~58.0.11");
  assert.ok(mobile.expo.autolinking.ios.buildFromSource.includes("expo-image"));
});

test("iOS pod pin preserves existing build properties in one plugin", () => {
  const config = isolatedConfig({
    config: {
      plugins: [
        "expo-build-properties",
        [
          "expo-build-properties",
          {
            ios: {
              deploymentTarget: "16.0",
              extraPods: [
                { name: "CustomPod", version: "1.2.3" },
                { name: "ReachabilitySwift", version: "5.2.4" },
              ],
            },
            android: { minSdkVersion: 28 },
          },
        ],
      ],
    },
  });
  const properties = config.plugins.filter(
    (plugin: unknown) =>
      Array.isArray(plugin) && plugin[0] === "expo-build-properties",
  );
  assert.equal(properties.length, 1);
  assert.deepEqual(properties[0][1], {
    android: { minSdkVersion: 28 },
    ios: {
      deploymentTarget: "16.0",
      extraPods: [
        { name: "CustomPod", version: "1.2.3" },
        { name: "ReachabilitySwift", version: "5.2.3" },
      ],
    },
  });
});
