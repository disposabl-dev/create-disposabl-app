import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const configure = require("../../apps/mobile/app.config.js");
const mobile = require("../../apps/mobile/package.json");

test("iOS build properties constrain the Expo Updates reachability pod", () => {
  const config = configure({ config: { plugins: ["existing-plugin"] } });
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
  assert.deepEqual(mobile.expo.autolinking.ios.buildFromSource, ["expo-image"]);
});
