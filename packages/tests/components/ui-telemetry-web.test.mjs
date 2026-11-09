import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = new EventTarget();
window.location = { pathname: "/" };
Object.defineProperty(globalThis, "navigator", {
  value: { doNotTrack: "0" },
  configurable: true,
});
const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
process.env.PROD = "true";
process.env.VITE_CONVEX_SITE_URL = "http://127.0.0.1:9999";
process.env.VITE_DISPOSABL_ANALYTICS_ENABLED = "true";
process.env.VITE_E2E = "true";
let initialized = 0;
let sdkOptions;
const events = [];
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
mock.module("posthog-js", () => ({
  PostHog: class {
    init(_key, options) {
      initialized++;
      this.options = options;
      sdkOptions = options;
    }
    capture(event, properties = {}) {
      const result = this.options.before_send({
        uuid: "test",
        event,
        properties: {
          ...properties,
          $current_url: "https://example.test/?token=secret",
        },
      });
      if (result) events.push(result);
    }
    opt_out_capturing() {
      stops();
    }
    reset() {}
    startSessionRecording() {}
    stopSessionRecording() {}
  },
}));
const { ProductTelemetry, AnalyticsPreference } =
  await import("../../../apps/web/src/telemetry");
let renderer;
afterEach(async () => {
  await act(async () => renderer?.unmount());
});

test("web E2E never initializes or contacts bootstrap", async () => {
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
});

test("Do Not Track prevents web bootstrap and SDK initialization", async () => {
  process.env.VITE_E2E = "false";
  navigator.doNotTrack = "1";
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
  navigator.doNotTrack = "0";
});

test("web bootstraps, strips URL and stops immediately on opt-out", async () => {
  process.env.VITE_E2E = "false";
  await act(async () => {
    renderer = create(
      createElement(
        "Root",
        null,
        createElement(ProductTelemetry, {
          pathname: "/dashboard/connections",
          token: null,
          ready: true,
        }),
        createElement(AnalyticsPreference),
      ),
    );
  });
  expect(initialized).toBe(1);
  expect(events[0].properties).toEqual({
    token: "test",
    distinct_id: "server-id",
    page: "connections",
    platform: "web",
    $current_url: "https://www.disposabl.dev/dashboard/connections",
  });
  const id = "01890abc-1234-7123-8123-123456789abc";
  const snapshot = {
    uuid: "test",
    event: "$snapshot",
    properties: {
      $snapshot_data: [],
      $snapshot_bytes: 1,
      $session_id: id,
      $window_id: id,
      private: "drop",
    },
  };
  expect(sdkOptions.before_send(snapshot)).toBeNull();
  window.location.pathname = "/login";
  expect(sdkOptions.before_send(snapshot)).toBeNull();
  window.location.pathname = "/";
  await act(async () => {
    renderer.root.findByType("button").props.onClick();
  });
  expect(stops).toHaveBeenCalled();
  expect(values.get("disposabl.product.analytics.optout.v1")).toBe("1");
  expect(sdkOptions.before_send(snapshot)).toBeNull();
});
