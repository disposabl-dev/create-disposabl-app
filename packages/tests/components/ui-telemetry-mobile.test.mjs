import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__DEV__ = false;
process.env.EXPO_PUBLIC_CONVEX_SITE_URL = "http://127.0.0.1:9999";
process.env.EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED = "true";
process.env.EXPO_PUBLIC_E2E = "true";
const events = [];
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
      stops();
      return Promise.resolve();
    }
    reset() {}
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
  expect(requests).toHaveBeenCalledTimes(1);
  expect(events[0].properties).toEqual({
    token: "test",
    distinct_id: "server-id",
    $screen_name: "app_detail",
    platform: "mobile",
  });
  captureProductAction("open_create");
  expect(events[1].properties.action).toBe("open_create");
  for (const action of ["open_connections", "open_app", "open_settings"])
    captureProductAction(action);
  expect(events.slice(1).map((event) => event.properties.action)).toEqual([
    "open_create",
    "open_connections",
    "open_app",
    "open_settings",
  ]);
  captureProductAction("private-app-id");
  expect(events).toHaveLength(5);
  expect(JSON.stringify(events)).not.toContain("private-id");
  const now = Date.now;
  Date.now = () => now() + 31_000;
  captureProductAction("open_app");
  Date.now = now;
  expect(events).toHaveLength(5);
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
  expect(events).toHaveLength(5);
  await act(async () => {
    renderer.root.findByType("PreferenceRow").props.onPress();
    await Promise.resolve();
  });
  expect(saved).toBe("1");
  expect(stops).toHaveBeenCalled();
  captureProductAction("open_create");
  expect(events).toHaveLength(5);
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
