import { afterEach, expect, mock, test } from "bun:test";
import { createElement, forwardRef, useImperativeHandle } from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__DEV__ = false;
process.env.EXPO_PUBLIC_CONVEX_SITE_URL = "http://127.0.0.1:9999";
process.env.EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED = "true";
process.env.EXPO_PUBLIC_E2E = "false";
const events = [];
const pushes = [];
const scrolls = [];
let captureThrows = false;
let id = "secret-marker-id";
const guides = [
  {
    id: "secret-marker-id",
    title: "secret-marker-title",
    body: "secret-marker-body",
    section: "Fundamentals",
  },
  { id: "other", title: "Other", body: "Content", section: "Introduction" },
  { id: "third", title: "Third", body: "Content", section: "Mastery · Test" },
];
const FlatList = forwardRef(({ data, renderItem, ...props }, ref) => {
  useImperativeHandle(ref, () => ({
    scrollToIndex: (value) => scrolls.push(value),
  }));
  return createElement(
    "FlatList",
    props,
    ...data.map((item, index) =>
      createElement("Item", { key: item.id }, renderItem({ item, index })),
    ),
  );
});
mock.module("react-native", () => ({
  View: "View",
  ScrollView: "ScrollView",
  FlatList,
  useWindowDimensions: () => ({ width: 400, height: 800 }),
}));
mock.module("nativewind", () => ({ VariableContextProvider: "Variable" }));
mock.module("expo-router", () => ({
  useRouter: () => ({ push: (value) => pushes.push(value) }),
  useLocalSearchParams: () => ({ id }),
  Stack: { Screen: "StackScreen" },
}));
mock.module("../../../packages/disposabl-kit/mobile/design/use-theme", () => ({
  useTheme: () => ({ foreground: "x", mutedForeground: "x" }),
}));
mock.module("../../../apps/mobile/src/features/studio/data", () => ({
  guides,
  guideSections: ["Fundamentals", "Introduction", "Mastery · Test"],
}));
mock.module("../../../apps/mobile/src/features/studio/guide-art", () => ({
  GuideCover: "GuideCover",
}));
mock.module("../../../apps/mobile/src/features/studio/ui", () => ({
  Screen: "Screen",
  Label: "Label",
  Touch: "Touch",
  Icon: "Icon",
  Action: "Action",
  GlassSurface: "GlassSurface",
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
      if (captureThrows) throw Error("SDK unavailable");
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
const { default: GuidesScreen, GuideDetailScreen } =
  await import("../../../apps/mobile/src/features/studio/guides");
let renderer;
const tree = (screen) =>
  createElement(
    "Root",
    null,
    createElement(ProductTelemetry, {
      pathname: "/guides",
      token: null,
      ready: true,
    }),
    createElement(AnalyticsPreference),
    createElement(screen),
  );
async function mount(screen) {
  await act(async () => {
    renderer = create(tree(screen));
  });
}
async function touch(label) {
  const button = renderer.root
    .findAllByType("Touch")
    .find((x) => x.props.label === label);
  expect(button).toBeDefined();
  await act(async () => button.props.onPress());
}
async function layout() {
  await act(async () =>
    renderer.root
      .findAllByType("View")
      .find((x) => x.props.onLayout)
      .props.onLayout({ nativeEvent: { layout: { height: 700 } } }),
  );
}
afterEach(async () => {
  await act(async () => renderer?.unmount());
  events.length = 0;
  pushes.length = 0;
  scrolls.length = 0;
  captureThrows = false;
  id = "secret-marker-id";
});
test("featured, shelf and mastery handlers each emit one fixed action", async () => {
  await mount(GuidesScreen);
  await touch("Read Meet Disposabl");
  await touch("Read secret-marker-title");
  await touch("Explore Test");
  expect(pushes).toEqual([
    { pathname: "/guide-detail", params: { id: "welcome" } },
    { pathname: "/guide-detail", params: { id: "secret-marker-id" } },
    { pathname: "/guide-detail", params: { id: "third" } },
  ]);
  expect(events.map((e) => e.properties.action)).toEqual([
    "open_guide",
    "open_guide",
    "open_guide",
  ]);
  await act(async () => renderer.update(tree(GuidesScreen)));
  expect(events).toHaveLength(3);
  expect(JSON.stringify(events)).not.toContain("secret-marker");
});
test("lesson controls ignore bounds; valid previous and next emit once, scrolling does not", async () => {
  await mount(GuideDetailScreen);
  await layout();
  const actions = renderer.root.findAllByType("Action");
  await act(async () => actions[0].props.onPress());
  await act(async () => actions[1].props.onPress());
  await act(async () => actions[2].props.onPress());
  await act(async () => actions.at(-1).props.onPress());
  expect(scrolls).toEqual([{ index: 1 }, { index: 0 }]);
  expect(events.map((e) => e.properties.action)).toEqual([
    "open_guide",
    "open_guide",
  ]);
  await act(async () =>
    renderer.root.findByType("FlatList").props.onMomentumScrollEnd({
      nativeEvent: { contentOffset: { y: 700 } },
    }),
  );
  expect(events).toHaveLength(2);
});
test("capture failure cannot interrupt navigation", async () => {
  await mount(GuidesScreen);
  captureThrows = true;
  await touch("Read secret-marker-title");
  expect(pushes).toHaveLength(1);
  expect(events).toHaveLength(0);
});
test("capture failure cannot interrupt lesson controls", async () => {
  await mount(GuideDetailScreen);
  await layout();
  captureThrows = true;
  const actions = renderer.root.findAllByType("Action");
  await act(async () => actions[1].props.onPress());
  await act(async () => actions[2].props.onPress());
  expect(scrolls).toEqual([{ index: 1 }, { index: 0 }]);
  expect(events).toHaveLength(0);
});
test("expired lease, opt-out and E2E suppress actions while navigation continues", async () => {
  await mount(GuidesScreen);
  const now = Date.now;
  Date.now = () => now() + 31000;
  await touch("Read Meet Disposabl");
  Date.now = now;
  await act(async () => {
    renderer.root.findByType("PreferenceRow").props.onPress();
    await Promise.resolve();
  });
  await touch("Read Meet Disposabl");
  expect(events).toHaveLength(0);
  expect(pushes).toHaveLength(2);
  await act(async () => {
    renderer.root.findByType("PreferenceRow").props.onPress();
    await Promise.resolve();
    renderer.unmount();
  });
  process.env.EXPO_PUBLIC_E2E = "true";
  const count = fetch.mock.calls.length;
  await mount(GuidesScreen);
  await touch("Read Meet Disposabl");
  expect(events).toHaveLength(0);
  expect(fetch.mock.calls.length).toBe(count);
  process.env.EXPO_PUBLIC_E2E = "false";
});
