import { afterEach, expect, mock, test } from "bun:test";
mock.module("@expo/vector-icons/MaterialCommunityIcons", () => ({
  default: "PlatformIcon",
}));
import { createElement, createContext } from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const actions = [];
const push = mock();
let apps = [];
let auth = { isAuthenticated: true, isLoading: false };
let appStatus = "Exhausted";
const loadMore = mock();
const pageOptions = mock();
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
mock.module("react-native-svg", () => ({ default: "Svg", Path: "Path" }));
mock.module("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ left: 0, right: 0 }),
}));
mock.module("../../../packages/disposabl-kit/mobile/design/nativewind", () => ({
  MenuView: "MenuView",
}));
mock.module("../../../packages/disposabl-kit/mobile/design/use-theme", () => ({
  useTheme: () => ({
    card: "card",
    muted: "muted",
    mutedForeground: "muted",
    foreground: "foreground",
    background: "background",
  }),
}));
mock.module("@disposabl/disposabl-kit/features", () => ({
  authenticationEnabled: true,
  paymentsEnabled: false,
}));
mock.module("@disposabl/disposabl-kit/platforms", () => ({
  platforms: [
    { id: "web", label: "Web" },
    { id: "mcp", label: "MCP" },
  ],
  resolvePlatforms: (value) => value,
}));
mock.module("convex/react", () => ({
  useConvexAuth: () => auth,
  usePaginatedQuery: (_query, _args, options) => {
    pageOptions(options);
    return { results: apps, status: appStatus, loadMore };
  },
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
mock.module("../../../apps/mobile/src/features/management/ai-safety", () => ({
  useAiConsent: () => ({ allowed: true, confirm: async () => true }),
}));
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
  auth = { isAuthenticated: true, isLoading: false };
  appStatus = "Exhausted";
  loadMore.mockClear();
  pageOptions.mockClear();
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

test("MCP choice shows its logo in the selected theme color", async () => {
  await mount(ManagementHome);
  const choice = renderer.root
    .findAllByType("Touch")
    .find((x) => x.props.label === "MCP");
  expect(choice.findByType("Path").props.fill).toBe("foreground");
  await act(async () => choice.props.onPress());
  expect(choice.findByType("Path").props.fill).toBe("background");
});

test("Apps auth loading and guest states keep the shared screen and hook boundary", async () => {
  auth = { isAuthenticated: false, isLoading: true };
  await mount(Apps);
  expect(renderer.root.findByType("Screen").props.title).toBe("Your apps");
  expect(
    renderer.root.findByType("ActivityIndicator").props.accessibilityLabel,
  ).toBe("Loading apps");
  expect(pageOptions).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
  auth = { isAuthenticated: false, isLoading: false };
  await mount(Apps);
  expect(renderer.root.findByType("Screen").props.title).toBe("Your apps");
  expect(
    renderer.root.findAllByType("Label").map((node) => node.props.children),
  ).toEqual([
    "A home for your ideas.",
    "Sign in to create and manage your apps.",
  ]);
  const signIn = renderer.root.findByType("Action");
  expect(signIn.props.label).toBe("Sign in");
  await act(async () => signIn.props.onPress());
  expect(push).toHaveBeenCalledWith("/(auth)/login");
  expect(pageOptions).not.toHaveBeenCalled();
});

test("Apps pagination preserves loading, empty, row navigation and page size", async () => {
  appStatus = "LoadingFirstPage";
  await mount(Apps);
  expect(
    renderer.root.findByType("ActivityIndicator").props.accessibilityLabel,
  ).toBe("Loading apps");
  expect(pageOptions.mock.calls[0][0]).toEqual({ initialNumItems: 20 });
  await act(async () => renderer.unmount());
  appStatus = "Exhausted";
  await mount(Apps);
  expect(renderer.root.findByType("Label").props.children).toBe(
    "Create your first app.",
  );
  expect(renderer.root.findByType("Action").props.label).toBe("Create app");
  await act(async () => renderer.unmount());
  apps = [{ appId: "example-id", name: "Example", platforms: ["web"] }];
  appStatus = "CanLoadMore";
  await mount(Apps);
  expect(renderer.root.findByType("Touch").props.label).toBe("Open Example");
  await act(async () => renderer.root.findByType("Touch").props.onPress());
  expect(push).toHaveBeenCalledWith({
    pathname: "/(authenticated)/apps/[appId]",
    params: { appId: "example-id" },
  });
  const more = renderer.root.findByType("Action");
  expect(more.props.label).toBe("More apps");
  await act(async () => more.props.onPress());
  expect(loadMore).toHaveBeenCalledWith(
    pageOptions.mock.calls[0][0].initialNumItems,
  );
  await act(async () => renderer.unmount());
  appStatus = "LoadingMore";
  await mount(Apps);
  expect(
    renderer.root.findByType("ActivityIndicator").props.accessibilityLabel,
  ).toBe("Loading more apps");
});
