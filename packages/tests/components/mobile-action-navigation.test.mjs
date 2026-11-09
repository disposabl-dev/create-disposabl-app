import { afterEach, expect, mock, test } from "bun:test";
import { createElement, createContext } from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const actions = [];
const push = mock();
let apps = [];
const router = { push, replace: mock(), back: mock(), canGoBack: () => false };
mock.module("../../../apps/mobile/src/features/product-telemetry", () => ({
  captureProductAction: (action) => actions.push(action),
}));
mock.module("expo-router", () => ({
  router,
  useRouter: () => router,
  useLocalSearchParams: () => ({ slug: "example" }),
  Stack: { Screen: "StackScreen" },
}));
mock.module("nativewind", () => ({ VariableContextProvider: "Variable" }));
mock.module("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ActivityIndicator: "ActivityIndicator",
  useWindowDimensions: () => ({ width: 400 }),
  FlatList: ({
    data = [],
    renderItem,
    ListEmptyComponent,
    ListFooterComponent,
  }) =>
    createElement(
      "FlatList",
      null,
      ...(data.length
        ? data.map((item) => renderItem({ item }))
        : [ListEmptyComponent]),
      ListFooterComponent,
    ),
}));
mock.module("expo-symbols", () => ({ SymbolView: "Symbol" }));
mock.module("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ left: 0, right: 0 }),
}));
mock.module("../../../packages/disposabl-kit/mobile/design/nativewind", () => ({
  MenuView: "MenuView",
}));
mock.module("../../../packages/disposabl-kit/mobile/design/use-theme", () => ({
  useTheme: () => ({ card: "card", muted: "muted", mutedForeground: "muted" }),
}));
mock.module("@disposabl/disposabl-kit/features", () => ({
  authenticationEnabled: true,
  paymentsEnabled: false,
}));
mock.module("@disposabl/disposabl-kit/platforms", () => ({
  platforms: [{ id: "web", label: "Web" }],
  resolvePlatforms: (value) => value,
}));
mock.module("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  usePaginatedQuery: () => ({ results: apps, status: "Exhausted" }),
  useQuery: () => undefined,
  useMutation: () => async () => "https://fixture.invalid",
  useAction: () => async () => ({}),
}));
mock.module("@convex-dev/auth/react", () => ({ useAuthToken: () => null }));
mock.module("expo-linking", () => ({ openURL: mock(async () => {}) }));
mock.module("../../../apps/mobile/src/features/studio/session-current", () => ({
  SessionCurrentContext: createContext(() => true),
}));
mock.module(
  "../../../apps/mobile/src/features/studio/connection-panel",
  () => ({ ConnectionPanel: "ConnectionPanel" }),
);
mock.module(
  "../../../apps/mobile/src/features/studio/message-composer",
  () => ({ MessageComposer: "MessageComposer" }),
);
mock.module("../../../apps/mobile/src/features/studio/attachments", () => ({
  useAttachments: () => ({
    attachments: [],
    isActive: () => true,
    busy: false,
  }),
}));
mock.module(
  "../../../apps/mobile/src/features/management/payment-gate",
  () => ({ PaymentGate: "PaymentGate" }),
);
mock.module("../../../apps/mobile/src/features/management/ui", () => ({
  ErrorBoundary: "ErrorBoundary",
}));
mock.module("../../../apps/mobile/src/features/studio/data", () => ({
  examples: [
    { slug: "example", name: "private-app-name", targets: [], line: "example" },
  ],
}));
mock.module("../../../apps/mobile/src/features/studio/art", () => ({
  AppArtwork: "Artwork",
}));
mock.module("../../../apps/mobile/src/features/studio/ui", () => ({
  Action: "Action",
  Icon: "Icon",
  Label: "Label",
  Screen: "Screen",
  Touch: "Touch",
  TargetBadges: "Badges",
}));
const { default: Home } =
  await import("../../../apps/mobile/src/features/studio/home");
const { default: Apps } =
  await import("../../../apps/mobile/src/features/studio/apps");
const { ExampleScreen } =
  await import("../../../apps/mobile/src/features/studio/catalogue");
const { AccountButton } =
  await import("../../../apps/mobile/src/features/studio/account-button");
const { ConnectionsScreen } =
  await import("../../../apps/mobile/src/features/studio/connections");
const { ConversationHeader } =
  await import("../../../apps/mobile/src/features/management/conversation-header");
const { ManagementHome } =
  await import("../../../apps/mobile/src/features/management/home");
let renderer;
async function mount(component) {
  await act(async () => {
    renderer = create(createElement(component));
  });
}
afterEach(async () => {
  await act(async () => renderer?.unmount());
  actions.length = 0;
  push.mockClear();
  apps = [];
});

test("actual create and app navigation buttons emit one fixed category", async () => {
  await mount(Home);
  const createButton = renderer.root
    .findAllByType("Touch")
    .find((x) => x.props.label === "Create app");
  await act(async () => createButton.props.onPress());
  expect(actions).toEqual(["open_create"]);
  await act(async () => renderer.unmount());
  actions.length = 0;
  await mount(Apps);
  await act(async () => renderer.root.findByType("Action").props.onPress());
  expect(actions).toEqual(["open_create"]);
  await act(async () => renderer.unmount());
  actions.length = 0;
  apps = [{ appId: "private-app-id", name: "private-app-name", platforms: [] }];
  await mount(Apps);
  await act(async () => renderer.root.findByType("Touch").props.onPress());
  expect(actions).toEqual(["open_app"]);
  expect(JSON.stringify(actions)).not.toContain("private");
  await act(async () => renderer.unmount());
  actions.length = 0;
  await mount(ExampleScreen);
  await act(async () => renderer.root.findByType("Action").props.onPress());
  expect(actions).toEqual(["open_create"]);
});

test("settings, connection controls and conversation navigation emit once per press", async () => {
  await mount(AccountButton);
  await act(async () => renderer.root.findByType("Pressable").props.onPress());
  expect(actions).toEqual(["open_settings"]);
  await act(async () => renderer.unmount());
  actions.length = 0;
  await mount(ConnectionsScreen);
  const panel = renderer.root.findByType("ConnectionPanel");
  await act(async () => {
    panel.props.onConnect();
    await Promise.resolve();
  });
  expect(actions).toEqual(["open_connections"]);
  await act(async () => renderer.unmount());
  actions.length = 0;
  await mount(ManagementHome);
  await act(async () => {
    renderer.root.findByType("MessageComposer").props.onSend("private-prompt");
    await Promise.resolve();
  });
  await act(async () => {
    renderer.root.findByType("ConnectionPanel").props.onProvider();
    await Promise.resolve();
  });
  expect(actions).toEqual(["open_connections"]);
  await act(async () => renderer.unmount());
  actions.length = 0;
  await act(async () => {
    renderer = create(
      createElement(ConversationHeader, { appId: "private-app-id" }),
    );
  });
  const right =
    renderer.root.findByType("StackScreen").props.options.headerRight;
  await act(async () => {
    renderer.update(right());
  });
  await act(async () => renderer.root.findByType("Pressable").props.onPress());
  await act(async () =>
    renderer.root
      .findByType("MenuView")
      .props.onPressAction({ nativeEvent: { event: "settings" } }),
  );
  expect(actions).toEqual(["open_create", "open_settings"]);
  expect(JSON.stringify(actions)).not.toContain("private");
});
