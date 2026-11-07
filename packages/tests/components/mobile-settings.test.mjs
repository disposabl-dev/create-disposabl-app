import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const features = {
  authenticationEnabled: process.env.TEST_AUTH_DISABLED !== "true",
  paymentsEnabled: false,
};
let authenticated = false;
let renderer;
const replace = mock();
const authState = mock(() => {
  if (!features.authenticationEnabled)
    throw new Error("Auth provider is absent");
  return { isAuthenticated: authenticated, isLoading: false };
});
const query = mock(() => ({ id: "user", username: "example" }));
mock.module("../../disposabl-kit/features", () => features);
mock.module("convex/react", () => ({
  useConvexAuth: authState,
  useQuery: query,
}));
mock.module("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signOut: async () => {} }),
}));
mock.module("expo-router", () => ({ router: { push: mock(), replace } }));
mock.module("react-native", () => ({ View: "View" }));
mock.module("expo-constants", () => ({
  default: { expoConfig: { version: "1" } },
}));
mock.module("expo-clipboard", () => ({ setStringAsync: async () => true }));
mock.module("../../disposabl-kit/mobile/components/settings-page", () => ({
  SettingsPage: "SettingsPage",
}));
mock.module("../../disposabl-kit/mobile/components/account-profile", () => ({
  AccountProfile: "Profile",
}));
mock.module(
  "../../disposabl-kit/mobile/components/appearance-settings",
  () => ({ AppearanceSettings: "Appearance" }),
);
mock.module("../../disposabl-kit/mobile/design/preferences", () => ({
  PreferenceCard: "Card",
  PreferenceRow: "Row",
  PreferenceSection: "Section",
  usePreferenceColors: () => ({}),
}));
mock.module("../../disposabl-kit/mobile/design/themed-text", () => ({
  ThemedText: "Text",
}));
mock.module("../../disposabl-kit/mobile/lib/convex", () => ({
  api: { users: { index: { current: "user" } }, auth: { account: "account" } },
}));
mock.module("../../disposabl-kit/mobile/billing/account-billing", () => ({
  AccountBilling: "Billing",
}));
mock.module("../../disposabl-kit/mobile/billing/session", () => ({
  billingSession: { select: mock() },
}));
mock.module("../../disposabl-kit/mobile/components/settings-links", () => ({
  SettingsLinks: "SettingsLinks",
}));
const { AccountScreen } =
  await import("../../disposabl-kit/mobile/screens/account");
const mount = () =>
  act(async () => {
    renderer = create(createElement(AccountScreen));
  });
afterEach(async () => {
  await act(async () => renderer?.unmount());
  authenticated = false;
  query.mockClear();
  authState.mockClear();
  replace.mockClear();
});

test.skipIf(features.authenticationEnabled)(
  "auth-disabled settings expose preferences without mounting auth hooks",
  async () => {
    await mount();
    expect(renderer.root.findAllByType("Appearance")).toHaveLength(1);
    expect(authState).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType("Row")).toHaveLength(0);
  },
);

test.skipIf(!features.authenticationEnabled)(
  "guests can change preferences and sign in with a settings return destination",
  async () => {
    await mount();
    expect(renderer.root.findAllByType("Appearance")).toHaveLength(1);
    expect(query).not.toHaveBeenCalled();
    const signIn = renderer.root.findByType("Row");
    expect(signIn.props.label).toBe("Sign in");
    await act(async () => signIn.props.onPress());
    expect(replace).toHaveBeenCalledWith({
      pathname: "/(auth)/login",
      params: { returnTo: "/settings" },
    });
  },
);

test.skipIf(!features.authenticationEnabled)(
  "session loss unmounts account subscriptions and keeps preferences available",
  async () => {
    authenticated = true;
    await mount();
    expect(renderer.root.findAllByType("Profile")).toHaveLength(1);
    query.mockClear();
    authenticated = false;
    await act(async () => renderer.update(createElement(AccountScreen)));
    expect(renderer.root.findAllByType("Profile")).toHaveLength(0);
    expect(renderer.root.findAllByType("Appearance")).toHaveLength(1);
    expect(query).not.toHaveBeenCalled();
  },
);
