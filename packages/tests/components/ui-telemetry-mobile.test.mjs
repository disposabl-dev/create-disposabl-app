import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
test("iOS disables the native push-open hook before JavaScript starts", () => {
  const configure = require("../../../apps/mobile/app.config.js");
  const { expo } = require("../../../apps/mobile/app.json");
  const keys = [
    "CONVEX_URL",
    "CONVEX_SITE_URL",
    "EXPO_PUBLIC_CONVEX_URL",
    "EXPO_PUBLIC_CONVEX_SITE_URL",
  ];
  const saved = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    expect(
      configure({ config: expo }).ios.infoPlist[
        "com.posthog.posthog.CAPTURE_PUSH_NOTIFICATION_OPENED"
      ],
    ).toBe(false);
  } finally {
    keys.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
  }
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__DEV__ = false;
process.env.EXPO_PUBLIC_CONVEX_SITE_URL = "http://127.0.0.1:9999";
process.env.EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED = "true";
process.env.EXPO_PUBLIC_E2E = "true";
const events = [];
const instances = [];
let initialized = 0;
let saved = null;
let finishRead;
const readPreference = mock(
  () =>
    new Promise((resolve) => {
      finishRead = resolve;
    }),
);
const stops = mock();
const requests = mock(
  async () =>
    new Response(
      JSON.stringify({
        enabled: true,
        projectToken: "test",
        host: "https://us.i.posthog.com",
        anonymousId: "00000000-0000-4000-8000-000000000001",
        distinctId: "server-id",
        identified: false,
        expiresAt: Date.now() + 30_000,
      }),
      { status: 200 },
    ),
);
globalThis.fetch = requests;
mock.module("expo-secure-store", () => ({
  getItemAsync: readPreference,
  setItemAsync: async (_key, value) => {
    saved = value;
  },
}));
mock.module("posthog-react-native", () => ({
  default: class {
    constructor(_key, options) {
      initialized++;
      this.options = options;
      instances.push(this);
    }
    screen() {
      const result = this.options.before_send({
        event: "$screen",
        properties: { secret: "do not send" },
      });
      if (result) events.push(result);
    }
    capture(event, properties) {
      const result = this.options.before_send({ event, properties });
      if (result) events.push(result);
    }
    optOut() {
      this.optedOut = true;
      stops();
      return Promise.resolve();
    }
    reset() {
      this.optedOut = false;
    }
  },
}));
mock.module(
  "../../../packages/disposabl-kit/mobile/design/preferences",
  () => ({
    PreferenceSection: "PreferenceSection",
    PreferenceRow: "PreferenceRow",
  }),
);
const { ProductTelemetry, AnalyticsPreference, captureProductAction } =
  await import("../../../apps/mobile/src/features/product-telemetry");
let renderer;
afterEach(async () => {
  await act(async () => renderer?.unmount());
});

test("concurrent preference consumers share one read and opt-out cannot be overwritten", async () => {
  await act(async () => {
    renderer = create(
      createElement(
        "Root",
        null,
        createElement(ProductTelemetry, {
          pathname: "/",
          token: null,
          ready: true,
        }),
        createElement(AnalyticsPreference),
      ),
    );
  });
  expect(readPreference).toHaveBeenCalledTimes(1);
  expect(initialized).toBe(0);
  expect(requests).toHaveBeenCalledTimes(0);
  captureProductAction("agent_send_attempt");
  captureProductAction("agent_stop_attempt");
  expect(events).toHaveLength(0);
  await act(async () => finishRead(null));
  await act(async () => {
    renderer.root.findByType("PreferenceRow").props.onPress();
    await Promise.resolve();
  });
  expect(saved).toBe("1");
  expect(renderer.root.findByType("PreferenceRow").props.value).toBe("No");
  expect(readPreference).toHaveBeenCalledTimes(1);
  expect(initialized).toBe(0);
  expect(requests).toHaveBeenCalledTimes(0);
  // Restore the preference for the later independent SDK behavior checks.
  await act(async () => {
    renderer.root.findByType("PreferenceRow").props.onPress();
    await Promise.resolve();
  });
});

test("development cannot initialize SDK or bootstrap", async () => {
  process.env.EXPO_PUBLIC_E2E = "false";
  globalThis.__DEV__ = true;
  await act(async () => {
    renderer = create(
      createElement(ProductTelemetry, {
        pathname: "/",
        token: null,
        ready: true,
      }),
    );
  });
  expect(initialized).toBe(0);
  expect(requests).toHaveBeenCalledTimes(0);
  globalThis.__DEV__ = false;
});

test("production waits for bootstrap, sanitizes screen and stops on local opt-out", async () => {
  process.env.EXPO_PUBLIC_E2E = "false";
  await act(async () => {
    renderer = create(
      createElement(
        "Root",
        null,
        createElement(ProductTelemetry, {
          pathname: "/apps/private-id",
          token: null,
          ready: true,
        }),
        createElement(AnalyticsPreference),
      ),
    );
  });
  expect(initialized).toBe(1);
  expect(instances[0].options.capturePushNotificationSubscriptions).toBe(false);
  expect(instances[0].options.capturePushNotificationOpened).toBe(false);
  expect(instances[0].options.disableGeoip).toBe(true);
  expect(requests).toHaveBeenCalledTimes(1);
  expect(events[0].properties).toEqual({
    token: "test",
    distinct_id: "server-id",
    $geoip_disable: true,
    $screen_name: "app_detail",
    platform: "mobile",
  });
  captureProductAction("open_create");
  expect(events[1].properties.action).toBe("open_create");
  for (const action of [
    "open_connections",
    "open_app",
    "open_settings",
    "agent_send_attempt",
    "agent_stop_attempt",
  ])
    captureProductAction(action);
  expect(events.slice(1).map((event) => event.properties.action)).toEqual([
    "open_create",
    "open_connections",
    "open_app",
    "open_settings",
    "agent_send_attempt",
    "agent_stop_attempt",
  ]);
  captureProductAction("private-app-id");
  expect(events).toHaveLength(7);
  expect(
    events.every((event) => event.properties.$geoip_disable === true),
  ).toBe(true);
  expect(JSON.stringify(events)).not.toContain("private-id");
  const now = Date.now;
  Date.now = () => now() + 31_000;
  captureProductAction("agent_send_attempt");
  captureProductAction("agent_stop_attempt");
  Date.now = now;
  expect(events).toHaveLength(7);
  await act(async () => {
    renderer.update(
      createElement(
        "Root",
        null,
        createElement(ProductTelemetry, {
          pathname: "/",
          token: "changed-session",
          ready: false,
        }),
        createElement(AnalyticsPreference),
      ),
    );
  });
  captureProductAction("open_settings");
  expect(events).toHaveLength(7);
  await act(async () => {
    renderer.root.findByType("PreferenceRow").props.onPress();
    await Promise.resolve();
  });
  expect(saved).toBe("1");
  expect(stops).toHaveBeenCalled();
  expect(instances.every((instance) => instance.optedOut)).toBe(true);
  captureProductAction("agent_send_attempt");
  captureProductAction("agent_stop_attempt");
  expect(events).toHaveLength(7);
});

test("a validated same-session token refresh resumes actions without recreating the SDK", async () => {
  const token = `x.${btoa(JSON.stringify({ sub: "same-session" }))}.`;
  const tree = (value) =>
    createElement(
      "Root",
      null,
      createElement(ProductTelemetry, {
        pathname: "/",
        token: value,
        ready: true,
      }),
      createElement(AnalyticsPreference),
    );
  await act(async () => {
    renderer = create(tree(token + "a"));
  });
  await act(async () => {
    renderer.root.findByType("PreferenceRow").props.onPress();
    await Promise.resolve();
  });
  const count = initialized;
  expect(instances.slice(0, -1).every((instance) => instance.optedOut)).toBe(
    true,
  );
  expect(instances.at(-1).optedOut).not.toBe(true);
  const before = events.length;
  captureProductAction("open_app");
  expect(events).toHaveLength(before + 1);
  const previous = requests.getMockImplementation();
  let finish;
  requests.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => {
    renderer.update(tree(token + "b"));
  });
  captureProductAction("open_app");
  expect(events).toHaveLength(before + 1);
  await act(async () => {
    finish(await previous());
  });
  expect(initialized).toBe(count);
  captureProductAction("open_settings");
  expect(events).toHaveLength(before + 2);
});
