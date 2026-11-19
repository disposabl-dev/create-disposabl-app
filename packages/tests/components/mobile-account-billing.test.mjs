import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = "test-key";
process.env.EXPO_PUBLIC_REVENUECAT_IOS_MONTHLY_PRODUCT = "test-monthly";
let snapshotFails = false;
let offeringFails = false;
let renderer;
const purchasePackage = mock();
const snapshot = {
  balance: 1000,
  customerId: "customer",
  hasMonthlyPlan: false,
  monthlyCheckoutPending: false,
  nativeSubscriptionsEnabled: true,
  nativeTopupRoutes: [],
  mobileWebCheckoutEnabled: false,
};
const sdk = {
  canMakePayments: async () => true,
  getCustomerInfo: async () => ({ activeSubscriptions: [] }),
  purchasePackage,
  getOfferings: async () => {
    if (offeringFails) throw new Error("BILLING_UNAVAILABLE");
    return {
      current: {
        availablePackages: [
          {
            product: {
              identifier: "test-monthly",
              subscriptionPeriod: "P1M",
              priceString: "$5.00",
            },
          },
        ],
      },
      all: {},
    };
  },
};
mock.module("react-native", () => ({
  AppState: { addEventListener: () => ({ remove() {} }) },
  Linking: { openURL: async () => {} },
  Platform: { OS: "ios" },
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
}));
const getSnapshot = async () => {
  if (snapshotFails) throw new Error("backend unavailable");
  return snapshot;
};
mock.module("convex/react", () => ({ useAction: () => getSnapshot }));
mock.module("../../../packages/disposabl-kit/mobile/billing/session", () => ({
  billingSession: {
    acquire: () => 1,
    release() {},
    current: () => true,
    beginTransaction: () => true,
    endTransaction() {},
    run: async (_id, _version, _key, action) => action(sdk),
  },
}));
mock.module(
  "../../../packages/disposabl-kit/mobile/billing/web-checkout",
  () => ({
    useWebCheckout: () => ({
      available: false,
      topupAvailable: false,
      busy: false,
      open: async () => {},
      error: "",
    }),
  }),
);
mock.module("../../../packages/disposabl-kit/mobile/billing/use-topup", () => ({
  useTopup: () => ({
    product: null,
    busy: false,
    purchase: async () => {},
    message: "",
  }),
}));
const { AccountBilling } =
  await import("../../../packages/disposabl-kit/mobile/billing/account-billing");
const mount = async () => {
  await act(async () => {
    renderer = create(
      createElement(AccountBilling, { customerId: "customer" }),
    );
  });
};
const texts = () =>
  renderer.root
    .findAllByType("Text")
    .flatMap((node) => [
      node.children
        .filter(
          (child) => typeof child === "string" || typeof child === "number",
        )
        .join(""),
    ]);
const contains = (text) => texts().some((value) => value.includes(text));
const press = async (label) => {
  const button = renderer.root
    .findAllByType("Pressable")
    .find((node) =>
      node
        .findAllByType("Text")
        .some((text) => text.children.join("").includes(label)),
    );
  expect(button).toBeDefined();
  await act(async () => {
    button.props.onPress();
  });
};
const refresh = () => press("Refresh");
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  snapshotFails = false;
  offeringFails = false;
  purchasePackage.mockReset();
});

test("a store offerings failure preserves a verified balance and does not offer a purchase", async () => {
  offeringFails = true;
  await mount();
  expect(contains("1,000 credits")).toBe(true);
  expect(contains("Store unavailable. Please try again.")).toBe(true);
  expect(contains("750 credits / month")).toBe(false);
});

test("a failed backend refresh clears a previously verified balance and offering", async () => {
  await mount();
  expect(contains("1,000 credits")).toBe(true);
  expect(contains("750 credits / month")).toBe(true);
  snapshotFails = true;
  await refresh();
  expect(contains("1,000 credits")).toBe(false);
  expect(contains("Unavailable")).toBe(true);
  expect(contains("750 credits / month")).toBe(false);
});

test("refresh recovers balance and offering when the store comes back", async () => {
  offeringFails = true;
  await mount();
  offeringFails = false;
  await refresh();
  expect(contains("1,000 credits")).toBe(true);
  expect(contains("750 credits / month")).toBe(true);
  expect(contains("$5.00 / mo")).toBe(true);
});

test("monthly credits open the store directly and cancellation stays quiet", async () => {
  purchasePackage.mockRejectedValue({ userCancelled: true });
  await mount();
  await press("750 credits / month");
  expect(purchasePackage).toHaveBeenCalledTimes(1);
  expect(purchasePackage.mock.calls[0][0].product.identifier).toBe(
    "test-monthly",
  );
  expect(contains("cancelled")).toBe(false);
  expect(
    renderer.root.findAllByProps({ accessibilityRole: "alert" }),
  ).toHaveLength(0);
});
