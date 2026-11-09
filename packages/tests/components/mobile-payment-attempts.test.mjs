import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__DEV__ = false;
process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = "secret-marker-key";
process.env.EXPO_PUBLIC_REVENUECAT_IOS_MONTHLY_PRODUCT =
  "secret-marker-product";
process.env.EXPO_PUBLIC_CONVEX_SITE_URL = "http://127.0.0.1:9999";
process.env.EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED = "true";
process.env.EXPO_PUBLIC_E2E = "false";
const events = [];
let current = true;
let transaction = true;
let webBusy = false;
let topupBusy = false;
let available = true;
let topupAvailable = true;
let product = { priceString: "secret-marker-price" };
const calls = [];
mock.module("react-native", () => ({
  View: "View",
  Text: "Text",
  Platform: { OS: "ios" },
  AppState: { addEventListener: () => ({ remove() {} }) },
}));
mock.module("convex/react", () => ({ useAction: () => async () => ({}) }));
mock.module("../../../apps/mobile/src/features/studio/ui", () => ({
  Action: "Action",
}));
mock.module("../../../packages/disposabl-kit/mobile/billing/session", () => ({
  billingSession: {
    acquire: () => 1,
    release() {},
    current: () => current,
    beginTransaction: () => transaction,
    endTransaction() {},
    run: async () => {},
  },
}));
mock.module(
  "../../../packages/disposabl-kit/mobile/billing/web-checkout",
  () => ({
    useWebCheckout: () => ({
      available,
      topupAvailable,
      busy: webBusy,
      open: async (kind) => calls.push(kind ?? "monthly"),
    }),
  }),
);
mock.module("../../../packages/disposabl-kit/mobile/billing/use-topup", () => ({
  useTopup: () => ({
    product,
    busy: topupBusy,
    purchase: async () => calls.push("topup"),
  }),
}));
mock.module("../../../packages/disposabl-kit/mobile/billing/paywall", () => ({
  monthlyOfferingId: "",
  presentMonthlyPaywall: async () => {},
  selectMonthlyOffering: () => null,
}));
mock.module("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
}));
mock.module(
  "../../../packages/disposabl-kit/mobile/design/preferences",
  () => ({
    PreferenceSection: "PreferenceSection",
    PreferenceRow: "PreferenceRow",
  }),
);
mock.module("posthog-react-native", () => ({
  default: class {
    constructor(_key, options) {
      this.options = options;
    }
    screen() {}
    capture(event, properties) {
      const result = this.options.before_send({ event, properties });
      if (result) events.push(result);
    }
    optOut() {
      return Promise.resolve();
    }
  },
}));
globalThis.fetch = mock(
  async () =>
    new Response(
      JSON.stringify({
        enabled: true,
        projectToken: "test",
        host: "https://us.i.posthog.com",
        anonymousId: "00000000-0000-4000-8000-000000000001",
        distinctId: "server-id",
        identified: false,
        expiresAt: Date.now() + 30000,
      }),
      { status: 200 },
    ),
);
const { ProductTelemetry, AnalyticsPreference } =
  await import("../../../apps/mobile/src/features/product-telemetry");
const { PaymentGate } =
  await import("../../../apps/mobile/src/features/management/payment-gate");
let renderer;
const props = {
  customerId: "secret-marker-customer",
  data: {
    nativeSubscriptionsEnabled: true,
    hasMonthlyPlan: false,
    monthlyCheckoutPending: false,
    balance: 12345,
  },
  refresh: async () => null,
  proceed() {},
  cancel() {},
};
const tree = () =>
  createElement(
    "Root",
    null,
    createElement(ProductTelemetry, {
      pathname: "/",
      token: null,
      ready: true,
    }),
    createElement(AnalyticsPreference),
    createElement(PaymentGate, props),
  );
async function mount() {
  await act(async () => {
    renderer = create(tree());
  });
}
async function press(label) {
  const button = renderer.root
    .findAllByType("Action")
    .find((x) => x.props.label.startsWith(label));
  expect(button).toBeDefined();
  await act(async () => button.props.onPress());
}
afterEach(async () => {
  await act(async () => renderer?.unmount());
  events.length = 0;
  calls.length = 0;
  current = true;
  transaction = true;
  webBusy = false;
  topupBusy = false;
  available = true;
  topupAvailable = true;
  product = { priceString: "secret-marker-price" };
});
test("actual payment handlers emit fixed attempt categories once", async () => {
  await mount();
  await press("View subscription");
  await press("Buy monthly on website");
  await press("Buy 5");
  await press("Buy top-up on website");
  expect(events.map((e) => e.properties.action)).toEqual([
    "billing_native_subscription_attempt",
    "billing_website_monthly_attempt",
    "billing_native_topup_attempt",
    "billing_website_topup_attempt",
  ]);
  expect(calls).toEqual(["monthly", "topup", "topup"]);
  await act(async () => renderer.update(tree()));
  expect(events).toHaveLength(4);
  expect(JSON.stringify(events)).not.toContain("secret-marker");
});
test("busy, stale session, unavailable and transaction guards do not emit", async () => {
  await mount();
  webBusy = true;
  await act(async () => renderer.update(tree()));
  await press("View subscription");
  await press("Buy monthly on website");
  await press("Buy 5");
  await press("Buy top-up on website");
  webBusy = false;
  current = false;
  await act(async () => renderer.update(tree()));
  await press("View subscription");
  await press("Buy monthly on website");
  await press("Buy 5");
  await press("Buy top-up on website");
  current = true;
  transaction = false;
  await press("View subscription");
  available = false;
  topupAvailable = false;
  product = null;
  await act(async () => renderer.update(tree()));
  expect(
    renderer.root.findAllByType("Action").map((x) => x.props.label),
  ).not.toContain("Buy monthly on website");
  expect(events).toHaveLength(0);
  expect(calls).toHaveLength(0);
});
test("expired telemetry lease and opt-out suppress handler events", async () => {
  await mount();
  const now = Date.now;
  Date.now = () => now() + 31000;
  await press("Buy monthly on website");
  Date.now = now;
  expect(events).toHaveLength(0);
  await act(async () => {
    renderer.root.findByType("PreferenceRow").props.onPress();
    await Promise.resolve();
  });
  await press("Buy top-up on website");
  expect(events).toHaveLength(0);
  await act(async () => {
    renderer.root.findByType("PreferenceRow").props.onPress();
    await Promise.resolve();
  });
});
test("E2E never initializes telemetry for payment attempts", async () => {
  process.env.EXPO_PUBLIC_E2E = "true";
  const count = globalThis.fetch.mock.calls.length;
  await mount();
  await press("Buy monthly on website");
  expect(events).toHaveLength(0);
  expect(globalThis.fetch.mock.calls.length).toBe(count);
  process.env.EXPO_PUBLIC_E2E = "false";
});
