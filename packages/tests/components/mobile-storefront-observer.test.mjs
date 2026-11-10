process.env.EXPO_PUBLIC_REVENUECAT_IOS_APP_ID = "fixture-app";
process.env.EXPO_PUBLIC_REVENUECAT_IOS_TOPUP_PRODUCT = "coins";
import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const listeners = new Set();
let topupReady = false;
let starts = 0,
  stops = 0,
  country = "USA",
  current = true,
  failStart = false,
  missing = false,
  pending,
  startPending,
  onStorefrontRead;
const link = {
  url: `https://fixture.invalid/billing-login#${"A".repeat(43)}`,
  userId: "owner",
};
const handoff = mock(async () => link);
const openURL = mock(async () => {});
const observer = {
  addListener(_event, callback) {
    listeners.add(callback);
    return { remove: () => listeners.delete(callback) };
  },
  async start() {
    starts++;
    if (failStart) throw Error("unavailable");
    return startPending ? await startPending : true;
  },
  async stop() {
    stops++;
  },
};
mock.module("expo", () => ({
  requireOptionalNativeModule: () => (missing ? null : observer),
}));
mock.module("expo-constants", () => ({ default: { expoConfig: {} } }));
mock.module("convex/server", () => ({
  makeFunctionReference: () => "fixture",
}));
mock.module("convex/react", () => ({ useMutation: () => handoff }));
mock.module("react-native", () => ({
  Platform: { OS: "ios" },
  Linking: { openURL },
  AppState: { addEventListener: () => ({ remove() {} }) },
}));
mock.module("../../../packages/disposabl-kit/mobile/billing/session", () => ({
  billingSession: {
    current: () => current,
    beginTransaction: () => true,
    endTransaction: () => {},
    run: async (_id, _version, _key, fn) =>
      fn({
        canMakePayments: async () => true,
        getStorefront: async () => {
          const value = pending
            ? await pending
            : country === "error"
              ? await Promise.reject(Error("unknown"))
              : country
                ? { countryCode: country }
                : null;
          onStorefrontRead?.();
          return value;
        },
        getCustomerInfo: async () => ({ activeSubscriptions: [] }),
        getOfferings: async () => ({}),
        getAppUserID: async () => "owner",
      }),
  },
}));
mock.module("../../../packages/disposabl-kit/mobile/billing/paywall", () => ({
  monthlyOfferingId: "",
  selectMonthlyOffering: () => ({}),
}));
mock.module("../../../packages/disposabl-kit/mobile/billing/topup", () => ({
  matchingTopupRoute: () => topupReady,
  loadTopup: async () => (topupReady ? { identifier: "coins" } : null),
}));
const { useWebCheckout } =
  await import("../../../packages/disposabl-kit/mobile/billing/web-checkout");
let renderer, result;
const version = { current: 1 };
const snapshot = async () => ({
  customerId: "owner",
  nativeSubscriptionsEnabled: true,
  hasMonthlyPlan: false,
  mobileWebCheckoutEnabled: true,
});
function Harness() {
  result = useWebCheckout("owner", version, "key", "product", snapshot);
  return null;
}
async function mount() {
  await act(async () => {
    renderer = create(createElement(Harness));
  });
}
async function change() {
  await act(async () => {
    for (const listener of [...listeners]) listener();
  });
}
afterEach(async () => {
  await act(async () => renderer?.unmount());
  topupReady = false;
  starts = 0;
  stops = 0;
  country = "USA";
  current = true;
  failStart = false;
  missing = false;
  pending = undefined;
  startPending = undefined;
  onStorefrontRead = undefined;
  handoff.mockReset().mockImplementation(async () => link);
  openURL.mockClear();
  listeners.clear();
});
test("active storefront changes and unknown/error fail closed", async () => {
  await mount();
  expect(result.available).toBe(true);
  country = "CAN";
  await change();
  expect(result.available).toBe(false);
  country = null;
  await change();
  expect(result.available).toBe(false);
  country = "error";
  await change();
  expect(result.available).toBe(false);
  country = "USA";
  await change();
  expect(result.available).toBe(true);
});
test("event invalidates pending eligibility and stale session results", async () => {
  await mount();
  let finish;
  pending = new Promise((resolve) => {
    finish = resolve;
  });
  await act(async () => {
    void result.refresh();
  });
  expect(result.available).toBe(false);
  country = "CAN";
  pending = undefined;
  await change();
  expect(result.available).toBe(false);
  await act(async () => finish({ countryCode: "USA" }));
  expect(result.available).toBe(false);
  current = false;
  country = "USA";
  await change();
  expect(result.available).toBe(false);
});
test("observer start failure and cleanup fail closed", async () => {
  failStart = true;
  await mount();
  expect(result.available).toBe(false);
  expect(starts).toBe(1);
  await act(async () => renderer.unmount());
  expect(listeners.size).toBe(0);
  expect(stops).toBe(0);
});
test("multiple mounts retain observation until each is removed", async () => {
  await mount();
  let second;
  await act(async () => {
    second = create(createElement(Harness));
  });
  expect(starts).toBe(2);
  await act(async () => renderer.unmount());
  expect(stops).toBe(1);
  expect(listeners.size).toBe(1);
  await act(async () => second.unmount());
  expect(stops).toBe(2);
  expect(listeners.size).toBe(0);
});

test("missing module and unmount during native start remain closed", async () => {
  missing = true;
  await mount();
  expect(result.available).toBe(false);
  expect(listeners.size).toBe(0);
  await act(async () => renderer.unmount());
  missing = false;
  let finish;
  startPending = new Promise((resolve) => {
    finish = resolve;
  });
  await mount();
  await act(async () => renderer.unmount());
  await act(async () => finish(true));
  expect(stops).toBe(1);
  expect(listeners.size).toBe(0);
});

test("an unchanged US storefront opens the validated handoff", async () => {
  await mount();
  let opened;
  await act(async () => {
    opened = await result.open();
  });
  expect(opened).toBe(true);
  expect(openURL).toHaveBeenCalledWith(link.url);
  expect(result.busy).toBe(false);
});

test("a change during the final storefront read cancels the handoff and clears busy", async () => {
  await mount();
  handoff.mockImplementationOnce(async () => {
    onStorefrontRead = () => {
      onStorefrontRead = undefined;
      country = "CAN";
      for (const listener of [...listeners]) listener();
    };
    return link;
  });
  let opened;
  await act(async () => {
    opened = await result.open();
  });
  expect(handoff).toHaveBeenCalledTimes(1);
  expect(opened).toBe(false);
  expect(openURL).not.toHaveBeenCalled();
  expect(result.busy).toBe(false);
  expect(result.available).toBe(false);
});

test("a queued callback from a removed subscription is ignored", async () => {
  const { observeStorefront } =
    await import("../../../packages/disposabl-kit/mobile/billing/storefront-observer");
  const changed = mock(() => {});
  const subscription = observeStorefront(changed);
  await subscription.ready;
  const queued = [...listeners][0];
  subscription.remove();
  queued();
  expect(changed).not.toHaveBeenCalled();
});

test("US top-up uses its own handoff purchase selection", async () => {
  topupReady = true;
  await mount();
  expect(result.topupAvailable).toBe(true);
  let opened;
  await act(async () => {
    opened = await result.open("topup");
  });
  expect(opened).toBe(true);
  expect(handoff).toHaveBeenCalledWith({ purchase: "topup" });
  expect(openURL).toHaveBeenCalledWith(link.url);
  expect(result.busy).toBe(false);
});

test("top-up rejects an unannounced non-US storefront before browser open", async () => {
  topupReady = true;
  await mount();
  handoff.mockImplementationOnce(async () => {
    country = "CAN";
    return link;
  });
  let opened;
  await act(async () => {
    opened = await result.open("topup");
  });
  expect(handoff).toHaveBeenCalledTimes(1);
  expect(opened).toBe(false);
  expect(openURL).not.toHaveBeenCalled();
  expect(result.topupAvailable).toBe(false);
  expect(result.busy).toBe(false);
});

test.each([null, "error"])(
  "top-up rejects an in-flight unknown storefront: %s",
  async (next) => {
    topupReady = true;
    await mount();
    handoff.mockImplementationOnce(async () => {
      country = next;
      return link;
    });
    let opened;
    await act(async () => {
      opened = await result.open("topup");
    });
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(opened).toBe(false);
    expect(openURL).not.toHaveBeenCalled();
    expect(result.busy).toBe(false);
  },
);

test("top-up rejects an in-flight session change", async () => {
  topupReady = true;
  await mount();
  handoff.mockImplementationOnce(async () => {
    current = false;
    return link;
  });
  let opened;
  await act(async () => {
    opened = await result.open("topup");
  });
  expect(handoff).toHaveBeenCalledTimes(1);
  expect(opened).toBe(false);
  expect(openURL).not.toHaveBeenCalled();
});
