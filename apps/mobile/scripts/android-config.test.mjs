import { test } from "node:test";
import assert from "node:assert/strict";
import configure from "../app.config.js";

function withEnv(values, action) {
  const previous = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (/^(EXPO_|DISPOSABL_|CONVEX_)/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, values);
  try {
    return action();
  } finally {
    process.env = previous;
  }
}

test("PR installations and update channels are isolated from production", () => {
  const config = {
    slug: "app",
    name: "App",
    android: {
      package: "app.example.mobile",
      runtimeVersion: { policy: "appVersion" },
    },
  };
  const result = withEnv(
    { EXPO_PROJECT_ID: "test-id", DISPOSABL_ANDROID_CHANNEL: "pr-12" },
    () => configure({ config }),
  );
  assert.equal(result.android.package, "app.example.mobile.pr12");
  assert.equal(result.updates.checkAutomatically, "ON_LOAD");
  assert.equal(result.updates.fallbackToCacheTimeout, 0);
  assert.equal(result.updates.requestHeaders["expo-channel-name"], "pr-12");
  assert.deepEqual(result.android.runtimeVersion, { policy: "fingerprint" });
  const production = withEnv(
    { EXPO_PROJECT_ID: "test-id", DISPOSABL_ANDROID_CHANNEL: "production" },
    () => configure({ config }),
  );
  assert.equal(production.android.package, "app.example.mobile");
  assert.equal(
    production.updates.requestHeaders["expo-channel-name"],
    "production",
  );
});

test("EAS cannot silently replace a deployed preview backend URL", () => {
  assert.throws(
    () =>
      withEnv(
        {
          CONVEX_URL: "https://correct.convex.cloud",
          EXPO_PUBLIC_CONVEX_URL: "https://wrong.convex.cloud",
        },
        () => configure({ config: {} }),
      ),
    /conflicts with the web deployment/,
  );
});

test("invalid version codes and channel input fail before native compilation", () => {
  for (const version of ["0", "-1", "1.2", "2100000001", "bad"]) {
    assert.throws(
      () =>
        withEnv({ DISPOSABL_ANDROID_VERSION_CODE: version }, () =>
          configure({ config: {} }),
        ),
      /version code/,
    );
  }
  assert.throws(
    () =>
      withEnv({ DISPOSABL_ANDROID_CHANNEL: "pr-12\nother" }, () =>
        configure({ config: {} }),
      ),
    /CHANNEL/,
  );
});

test("iOS previews share a provisionable identity while their channels remain isolated", () => {
  const config = { ios: { bundleIdentifier: "app.example.mobile" } };
  const preview = (channel) =>
    withEnv(
      {
        EXPO_PROJECT_ID: "test",
        DISPOSABL_MOBILE_CHANNEL: channel,
        DISPOSABL_IOS_BUILD_NUMBER: "42",
      },
      () => configure({ config }),
    );
  const first = preview("pr-12");
  const second = preview("pr-13");
  assert.equal(first.ios.bundleIdentifier, "app.example.mobile.preview");
  assert.equal(second.ios.bundleIdentifier, first.ios.bundleIdentifier);
  assert.equal(first.ios.buildNumber, "42");
  assert.equal(first.updates.checkAutomatically, "ON_LOAD");
  assert.equal(first.updates.fallbackToCacheTimeout, 0);
  assert.equal(first.updates.requestHeaders["expo-channel-name"], "pr-12");
  assert.equal(second.updates.requestHeaders["expo-channel-name"], "pr-13");
  assert.equal(
    preview("production").ios.bundleIdentifier,
    "app.example.mobile",
  );
  assert.throws(
    () =>
      withEnv({ DISPOSABL_IOS_BUILD_NUMBER: "bad" }, () =>
        configure({ config }),
      ),
    /BUILD_NUMBER/,
  );
});

test("preview naming can change without hardcoded PR syntax", () => {
  const config = withEnv(
    { EXPO_PROJECT_ID: "test", DISPOSABL_MOBILE_CHANNEL: "preview-42" },
    () => configure({ config: { ios: { runtimeVersion: "old" } } }),
  );
  assert.equal(
    config.updates.requestHeaders["expo-channel-name"],
    "preview-42",
  );
  assert.deepEqual(config.ios.runtimeVersion, { policy: "fingerprint" });
  assert.ok(config.android.package.endsWith(".preview42"));
});

test("manual EAS iOS builds use their profile channel", () => {
  const config = withEnv(
    { EXPO_PROJECT_ID: "test", EAS_BUILD_PROFILE: "ios-preview" },
    () => configure({ config: {} }),
  );
  assert.equal(config.updates.requestHeaders["expo-channel-name"], "preview");
});

test("isolated release tests disable native OTA loading even with a project configured", () => {
  for (const projectId of [undefined, "test-project"]) {
    const result = withEnv(
      {
        EXPO_PUBLIC_E2E: "true",
        ...(projectId ? { EXPO_PROJECT_ID: projectId } : {}),
      },
      () =>
        configure({
          config: {
            updates: { enabled: true, url: "https://example.com/updates" },
          },
        }),
    );
    assert.equal(result.updates.enabled, false);
    assert.deepEqual(
      result.plugins.find(
        (plugin) => Array.isArray(plugin) && plugin[0] === "expo-dev-client",
      ),
      [
        "expo-dev-client",
        { toolsButton: false, skipOnboarding: true, showMenuAtLaunch: false },
      ],
    );
  }
  const normal = withEnv({ EXPO_PROJECT_ID: "test-project" }, () =>
    configure({ config: { updates: { enabled: true } } }),
  );
  assert.equal(normal.updates.enabled, true);
  const disabled = withEnv({ EXPO_PROJECT_ID: "test-project" }, () =>
    configure({ config: { updates: { enabled: false } } }),
  );
  assert.equal(disabled.updates.enabled, false);
});
