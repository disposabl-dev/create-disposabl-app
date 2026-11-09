import { expect, mock, test } from "bun:test";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const require = createRequire(
  resolve(import.meta.dirname, "../../../apps/mobile/package.json"),
);
const entry =
  process.env.POSTHOG_RN_ENTRY || require.resolve("posthog-react-native");
const sdkDir = dirname(entry);
const native = {
  setup: mock(async () => {}),
  setOptOut: mock(async () => {}),
  unregisterPushNotificationToken: mock(async () => {}),
};
const reactNative = () => ({
  Platform: { OS: "ios", Version: "27" },
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove() {} }),
  },
  NativeModules: {},
  Dimensions: { get: () => ({ width: 400, height: 800, scale: 1 }) },
});
mock.module("react-native", reactNative);
mock.module(createRequire(entry).resolve("react-native"), reactNative);
mock.module(join(sdkDir, "optional/OptionalPlugin.js"), () => ({
  OptionalReactNativePlugin: native,
  OptionalReactNativePluginVersion: "2.13.0",
}));
globalThis.fetch = async () => {
  throw new Error("fixture transport denied");
};
const { PostHog } = await import(join(sdkDir, "posthog-rn.js"));
const options = (distinctId) => ({
  host: "https://invalid.invalid",
  persistence: "memory",
  bootstrap: { distinctId, isIdentifiedId: true },
  captureAppLifecycleEvents: false,
  capturePushNotificationSubscriptions: false,
  capturePushNotificationOpened: false,
  errorTracking: { autocapture: false },
  rageClickConfig: { enabled: false },
  enableSessionReplay: false,
  disableRemoteFeatureFlags: true,
  preloadFeatureFlags: false,
  disableSurveys: true,
  fetchRetryCount: 0,
});

test("actual native SDK keeps a revoked lease opted out and starts a fresh identity", async () => {
  const old = new PostHog("fixture", options("fixture-old"));
  await old.ready();
  expect(require(join(sdkDir, "../package.json")).version).toBe("4.85.3");
  expect(native.setup).toHaveBeenCalledTimes(0);
  expect(old.getDistinctId()).toBe("fixture-old");
  await old.optOut();
  await old._nativeChain;
  expect(old.optedOut).toBe(true);
  const fresh = new PostHog("fixture", options("fixture-new"));
  await fresh.ready();
  await fresh._nativeChain;
  expect(fresh.getDistinctId()).toBe("fixture-new");
  expect(fresh.optedOut).toBe(false);
  expect(old.optedOut).toBe(true);
  expect(native.setup).toHaveBeenCalledTimes(0);
  await fresh.optOut();
  await fresh._nativeChain;
});

test("positive control: reset after opt out clears the opt-out state", async () => {
  const client = new PostHog("fixture", options("fixture-control"));
  await client.ready();
  await client.optOut();
  await client._nativeChain;
  expect(client.optedOut).toBe(true);
  client.reset();
  await client._nativeChain;
  expect(client.optedOut).toBe(false);
  await client.optOut();
});

test("positive control: default push collectors initialize the native plugin", async () => {
  native.setup.mockClear();
  const config = options("fixture-push-control");
  delete config.capturePushNotificationSubscriptions;
  delete config.capturePushNotificationOpened;
  const client = new PostHog("fixture", config);
  await client.ready();
  await client._nativeChain;
  expect(native.setup).toHaveBeenCalledTimes(1);
  await client.optOut();
  await client._nativeChain;
});

test("actual native SDK sends the GeoIP control through a reconstructing filter", async () => {
  const payloads = [];
  let sdkSetGeoip = false;
  const deniedFetch = globalThis.fetch;
  globalThis.fetch = async (_url, request) => {
    const body = request.body;
    const bytes = Buffer.from(
      body instanceof Blob ? await body.arrayBuffer() : body,
    );
    payloads.push(
      JSON.parse(
        bytes[0] === 31 ? gunzipSync(bytes).toString() : bytes.toString(),
      ),
    );
    return new Response("{}", { status: 200 });
  };
  const client = new PostHog("fixture", {
    ...options("fixture-geoip"),
    disableGeoip: true,
    flushAt: 1,
    before_send: (event) => {
      sdkSetGeoip = event.properties.$geoip_disable === true;
      return {
        ...event,
        properties: { $geoip_disable: true, action: event.properties.action },
      };
    },
  });
  try {
    await client.ready();
    client.capture("product_action", { action: "open_settings" });
    await client.flush();
    const events = payloads.flatMap((body) => body.batch ?? []);
    expect(sdkSetGeoip).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].properties.$geoip_disable).toBe(true);
    expect(events[0].properties.action).toBe("open_settings");
  } finally {
    await client.optOut();
    globalThis.fetch = deniedFetch;
  }
});
