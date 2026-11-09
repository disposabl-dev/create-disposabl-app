import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { getFunctionName } from "convex/server";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
class TestWindow extends EventTarget {}
globalThis.window = new TestWindow();
window.location = { pathname: "/pricing", search: "", assign: mock(() => {}) };
globalThis.Element = class {
  closest() {
    return null;
  }
};
const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
globalThis.localStorage = storage;
window.sessionStorage = storage;
Object.defineProperty(globalThis, "navigator", {
  value: { doNotTrack: "0" },
  configurable: true,
});
process.env.PROD = "true";
process.env.VITE_CONVEX_SITE_URL = "http://127.0.0.1:9999";
process.env.VITE_DISPOSABL_ANALYTICS_ENABLED = "true";
let authenticated = true;
let snapshotValue = {
  balance: 42,
  hasMonthlyPlan: false,
  checkoutNeedsReview: false,
  customerId: "SECRET_CUSTOMER_91",
};
const token = `header.${Buffer.from(JSON.stringify({ sub: "user" })).toString("base64url")}.sig`;
const snapshot = mock(async () => snapshotValue);
const checkout = mock(async () => ({ url: null }));
const portal = mock(async () => {
  throw new Error("SECRET_ERROR_91");
});
const events = [];
const bootstrap = mock(async () =>
  Response.json({
    enabled: true,
    projectToken: "fixture",
    host: "https://us.i.posthog.com",
    anonymousId: "00000000-0000-4000-8000-000000000001",
    distinctId: "fixture-id",
    identified: false,
    expiresAt: Date.now() + 30000,
  }),
);
globalThis.fetch = bootstrap;
mock.module("posthog-js", () => ({
  PostHog: class {
    init(_key, options) {
      this.options = options;
    }
    capture(event, properties = {}) {
      const result = this.options.before_send({ event, properties });
      if (result) events.push(result);
    }
    opt_out_capturing() {}
    reset() {}
  },
}));
mock.module("@convex-dev/auth/react", () => ({
  useAuthToken: () => (authenticated ? token : null),
}));
mock.module("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: authenticated, isLoading: false }),
  useAction: (ref) =>
    ({
      "billing:snapshot": snapshot,
      "billing:checkout": checkout,
      "billing:portal": portal,
    })[getFunctionName(ref)],
  useQuery: () => null,
}));
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (config) => config,
}));
mock.module("../../disposabl-kit/features", () => ({ paymentsEnabled: true }));
mock.module("../../disposabl-kit/client/components/consent-identity", () => ({
  useConsentIdentity: () => ({ state: "ready", label: "synthetic" }),
}));
const { Pricing } = await import("../../disposabl-kit/client/routes/pricing");
const { ProductTelemetry, AnalyticsPreference, captureProductAction } =
  await import("../../../apps/web/src/telemetry");
let renderer;
const button = (label) =>
  renderer.root
    .findAllByType("button")
    .find((node) => node.children.includes(label));
const invoke = async (label) => act(async () => button(label).props.onClick());
const actions = () =>
  events
    .filter((event) => event.event === "product_action")
    .map((event) => event.properties.action);
const mount = async (callback, e2e = false) => {
  process.env.VITE_E2E = e2e ? "true" : "false";
  await act(async () => {
    renderer = create(
      createElement(
        "Root",
        null,
        createElement(ProductTelemetry, {
          pathname: "/pricing",
          token: null,
          ready: true,
        }),
        createElement(AnalyticsPreference),
        createElement(Pricing, { onAttempt: callback }),
      ),
    );
  });
};
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  authenticated = true;
  window.location.search = "";
  values.clear();
  events.length = 0;
  snapshotValue = {
    balance: 42,
    hasMonthlyPlan: false,
    checkoutNeedsReview: false,
    customerId: "SECRET_CUSTOMER_91",
  };
  snapshot.mockClear();
  checkout.mockClear();
  portal.mockClear();
  bootstrap.mockClear();
});

test("actual button handlers send only fixed attempts once", async () => {
  await mount(captureProductAction);
  await invoke("Choose monthly");
  await invoke("Buy top-up");
  await invoke("Manage website billing");
  expect(checkout).toHaveBeenCalledTimes(2);
  expect(portal).toHaveBeenCalledTimes(1);
  expect(actions()).toEqual([
    "billing_monthly_checkout_attempt",
    "billing_topup_checkout_attempt",
    "billing_portal_attempt",
  ]);
  for (const marker of [
    "SECRET_CUSTOMER_91",
    "SECRET_ERROR_91",
    "requestId",
    "balance",
    "https://",
  ])
    expect(
      JSON.stringify(
        events.filter((event) => event.event === "product_action"),
      ),
    ).not.toContain(marker);
});

test("busy, signed-out, active monthly and invalid iOS handoff do not report guarded actions", async () => {
  let finish;
  checkout.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount(captureProductAction);
  await invoke("Choose monthly");
  expect(button("Buy top-up").props.disabled).toBe(true);
  await invoke("Buy top-up");
  await invoke("Manage website billing");
  expect(actions()).toEqual(["billing_monthly_checkout_attempt"]);
  await act(async () => finish({ url: null }));
  await act(async () => renderer.unmount());
  renderer = undefined;
  authenticated = false;
  events.length = 0;
  await mount(captureProductAction);
  await invoke("Choose monthly");
  expect(actions()).toEqual([]);
  await act(async () => renderer.unmount());
  renderer = undefined;
  authenticated = true;
  snapshotValue = { ...snapshotValue, hasMonthlyPlan: true };
  await mount(captureProductAction);
  await invoke("Monthly plan active or scheduled");
  expect(actions()).toEqual([]);
  await act(async () => renderer.unmount());
  renderer = undefined;
  window.location.search = "?source=ios";
  snapshotValue = { ...snapshotValue, hasMonthlyPlan: false };
  await mount(captureProductAction);
  expect(button("Choose monthly")).toBeUndefined();
  expect(button("Buy top-up")).toBeUndefined();
  expect(actions()).toEqual([]);
});

test("observer failure is harmless and absent callback is silent", async () => {
  const observer = mock(() => {
    throw new Error("SECRET_OBSERVER_91");
  });
  await mount(observer);
  await invoke("Choose monthly");
  await invoke("Buy top-up");
  await invoke("Manage website billing");
  expect(observer).toHaveBeenCalledTimes(3);
  expect(observer.mock.calls).toEqual([
    ["billing_monthly_checkout_attempt"],
    ["billing_topup_checkout_attempt"],
    ["billing_portal_attempt"],
  ]);
  expect(checkout).toHaveBeenCalledTimes(2);
  expect(portal).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
  renderer = undefined;
  await mount(undefined);
  await invoke("Buy top-up");
  expect(checkout).toHaveBeenCalledTimes(3);
});

test("E2E, expired lease and local opt-out suppress real handler events", async () => {
  await mount(captureProductAction, true);
  await invoke("Buy top-up");
  expect(bootstrap).not.toHaveBeenCalled();
  expect(actions()).toEqual([]);
  await act(async () => renderer.unmount());
  renderer = undefined;
  await mount(captureProductAction);
  const now = Date.now;
  try {
    Date.now = () => now() + 31000;
    await invoke("Buy top-up");
  } finally {
    Date.now = now;
  }
  expect(actions()).toEqual([]);
  await act(async () =>
    renderer.root
      .findAllByType("button")
      .find((node) => node.children.includes("Allow analytics:"))
      .props.onClick(),
  );
  await invoke("Manage website billing");
  expect(actions()).toEqual([]);
});
