import { afterEach, expect, mock, test } from "bun:test";
import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
} from "react";
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
const videos = new Map();
let appStateChange;
const appStateListeners = new Set();
const statusListeners = new Map();
let blur;
const guideLessons = [
  {
    id: "welcome",
    journey: "welcome",
    title: "Welcome",
    stage: "start",
    summary: "Intro",
    transcript: "Introduction",
    outcome: "Start",
    durationSeconds: 45,
  },
  {
    id: "secret-marker-id",
    journey: "practice",
    title: "secret-marker-title",
    stage: "start",
    summary: "First",
    transcript: "First transcript",
    outcome: "First outcome",
    durationSeconds: 45,
    video: { uri: "first.mp4" },
  },
  {
    id: "other",
    journey: "practice",
    title: "Other",
    stage: "publish",
    summary: "Next",
    transcript: "Other transcript",
    outcome: "Next outcome",
    durationSeconds: 40,
    video: { uri: "other.mp4" },
  },
  {
    id: "third",
    journey: "practice",
    title: "Third",
    stage: "run",
    summary: "Last",
    transcript: "Last transcript",
    outcome: "Last outcome",
    durationSeconds: 40,
  },
];
const guideJourneys = [
  {
    id: "welcome",
    title: "Start here",
    description: "Intro",
    kind: "welcome",
    lessonIds: ["welcome"],
  },
  {
    id: "practice",
    title: "Best practices",
    description: "Learn",
    kind: "practice",
    lessonIds: ["secret-marker-id", "other", "third"],
  },
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
  Alert: { alert() {} },
  Platform: { OS: "ios" },
  AppState: {
    currentState: "active",
    addEventListener: (_event, callback) => {
      appStateListeners.add(callback);
      appStateChange = (state) => {
        for (const listener of appStateListeners) listener(state);
      };
      return { remove: () => appStateListeners.delete(callback) };
    },
  },
  Linking: { openURL: async () => {} },
  Modal: "Modal",
  View: "View",
  ScrollView: "ScrollView",
  FlatList,
  useWindowDimensions: () => ({ width: 400, height: 800 }),
}));
mock.module("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => ({ top: 24, bottom: 0 }),
}));
mock.module("expo", () => ({
  useEventListener: (player, _event, callback) => {
    statusListeners.set(player.uri, callback);
  },
}));
mock.module("nativewind", () => ({
  VariableContextProvider: "Variable",
  styled: (component) => component,
}));
mock.module("expo-image", () => ({ Image: "Image" }));
mock.module("expo-router", () => ({
  useRouter: () => ({
    push: (value) => pushes.push(value),
    back: () => pushes.push("back"),
  }),
  useLocalSearchParams: () => ({ id }),
  Stack: { Screen: "StackScreen" },
  useFocusEffect: (callback) =>
    useEffect(() => {
      const cleanup = callback();
      blur = cleanup;
      return cleanup;
    }, [callback]),
}));
mock.module("../../../packages/disposabl-kit/mobile/design/use-theme", () => ({
  useTheme: () => ({ foreground: "x", mutedForeground: "x" }),
}));
mock.module("../../../packages/disposabl-kit/guides", () => ({
  guideLessons,
  guideJourneys,
}));
mock.module("@expo/vector-icons/MaterialIcons", () => ({
  default: "MaterialIcons",
}));
mock.module("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (uri, setup) =>
    useMemo(() => {
      const player = {
        uri,
        playing: false,
        play() {
          this.playing = true;
        },
        pause() {
          this.playing = false;
        },
      };
      setup(player);
      videos.set(uri, player);
      return player;
    }, [uri]),
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
  getItemAsync: async () => "allow",
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
  videos.clear();
});
test("featured and lesson handlers each emit one fixed action", async () => {
  await mount(GuidesScreen);
  await touch("About Welcome");
  await touch("Watch secret-marker-title");
  await touch("About Third");
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
test("capture failure cannot interrupt navigation", async () => {
  await mount(GuidesScreen);
  captureThrows = true;
  await touch("Watch secret-marker-title");
  expect(pushes).toHaveLength(1);
  expect(events).toHaveLength(0);
});
test("expired lease, opt-out and E2E suppress actions while navigation continues", async () => {
  await mount(GuidesScreen);
  const now = Date.now;
  Date.now = () => now() + 31000;
  await touch("About Welcome");
  Date.now = now;
  await act(async () => {
    renderer.root.findByType("PreferenceRow").props.onPress();
    await Promise.resolve();
  });
  await touch("About Welcome");
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
  await touch("About Welcome");
  expect(events).toHaveLength(0);
  expect(fetch.mock.calls.length).toBe(count);
  process.env.EXPO_PUBLIC_E2E = "false";
});

const pageFor = (index) => renderer.root.findAllByType("Item")[index];
const pageTouch = (index, label) =>
  pageFor(index)
    .findAllByType("Touch")
    .find((item) => item.props.label === label);
const swipeTo = async (index) =>
  act(async () =>
    renderer.root
      .findByType("FlatList")
      .props.onScroll({ nativeEvent: { contentOffset: { y: index * 700 } } }),
  );

test("swiping across journeys plays only the active reel and pauses on background and blur", async () => {
  await mount(GuideDetailScreen);
  await layout();
  expect(renderer.root.findByType("FlatList").props.initialScrollIndex).toBe(1);
  expect(videos.get("first.mp4").playing).toBe(true);
  expect(videos.get("other.mp4")).toBeUndefined();
  expect(
    renderer.root.findByType("StackScreen").props.options.headerShown,
  ).toBe(false);
  await swipeTo(2);
  expect(videos.get("first.mp4").playing).toBe(false);
  expect(videos.get("other.mp4").playing).toBe(true);
  await act(async () => appStateChange("background"));
  expect(videos.get("other.mp4").playing).toBe(false);
  await act(async () => appStateChange("active"));
  expect(videos.get("other.mp4").playing).toBe(false);
  await act(async () => pageTouch(2, "Play video").props.onPress());
  expect(videos.get("other.mp4").playing).toBe(true);
  await act(async () => blur());
  expect(videos.get("other.mp4").playing).toBe(false);
  expect(events).toHaveLength(0);
});

test("rotation keeps the selected reel and temporary interruption preserves manual pause", async () => {
  await mount(GuideDetailScreen);
  await layout();
  await swipeTo(2);
  await act(async () =>
    renderer.root
      .findAllByType("View")
      .find((x) => x.props.onLayout)
      .props.onLayout({ nativeEvent: { layout: { height: 400 } } }),
  );
  expect(renderer.root.findByType("FlatList").props.initialScrollIndex).toBe(2);
  expect(videos.get("other.mp4").playing).toBe(true);
  await act(async () => appStateChange("inactive"));
  expect(videos.get("other.mp4").playing).toBe(false);
  await act(async () => appStateChange("active"));
  expect(videos.get("other.mp4").playing).toBe(true);
  await act(async () => pageTouch(2, "Pause video").props.onPress());
  await act(async () =>
    renderer.root
      .findAllByType("View")
      .find((x) => x.props.onLayout)
      .props.onLayout({ nativeEvent: { layout: { height: 700 } } }),
  );
  expect(renderer.root.findByType("FlatList").props.initialScrollIndex).toBe(2);
  expect(videos.get("other.mp4").playing).toBe(false);
  expect(pageTouch(2, "Play video")).toBeDefined();
  await act(async () => appStateChange("inactive"));
  await act(async () => appStateChange("active"));
  expect(videos.get("other.mp4").playing).toBe(false);
});

test("description pauses the reel and shows the summary rather than the transcript", async () => {
  await mount(GuideDetailScreen);
  await layout();
  expect(renderer.root.findByType("Modal").props.visible).toBe(false);
  await act(async () =>
    pageTouch(1, "Show description for secret-marker-title").props.onPress(),
  );
  expect(renderer.root.findByType("Modal").props.visible).toBe(true);
  expect(videos.get("first.mp4").playing).toBe(false);
  const labels = renderer.root
    .findByType("Modal")
    .findAllByType("Label")
    .flatMap((item) => item.children);
  expect(labels).toContain("First");
  expect(labels).not.toContain("First transcript");
  await act(async () =>
    renderer.root
      .findAllByType("Touch")
      .find((item) => item.props.label === "Close description")
      .props.onPress(),
  );
  expect(renderer.root.findByType("Modal").props.visible).toBe(false);
  expect(videos.get("first.mp4").playing).toBe(true);
});

test("tap toggles playback and close returns to the library", async () => {
  await mount(GuideDetailScreen);
  await layout();
  expect(pageFor(1).findByType("VideoView").props.nativeControls).toBe(false);
  await act(async () => pageTouch(1, "Pause video").props.onPress());
  expect(videos.get("first.mp4").playing).toBe(false);
  await act(async () => pageTouch(1, "Play video").props.onPress());
  expect(videos.get("first.mp4").playing).toBe(true);
  await act(async () =>
    renderer.root
      .findAllByType("Touch")
      .find((item) => item.props.label === "Close guides")
      .props.onPress(),
  );
  expect(pushes).toEqual(["back"]);
});

test("text-only lessons offer their description without pretending video is available", async () => {
  id = "third";
  await mount(GuideDetailScreen);
  await layout();
  expect(pageFor(3).findAllByType("VideoView")).toHaveLength(0);
  await act(async () =>
    pageTouch(3, "Show description for Third").props.onPress(),
  );
  expect(renderer.root.findByType("Modal").props.visible).toBe(true);
  expect(
    renderer.root
      .findByType("Modal")
      .findAllByType("Label")
      .flatMap((item) => item.children),
  ).toContain("Last");
});

test("only the visible video is loaded and a failed video can retry", async () => {
  await mount(GuideDetailScreen);
  await layout();
  expect(renderer.root.findAllByType("VideoView")).toHaveLength(1);
  expect(videos.get("other.mp4")).toBeUndefined();
  expect(renderer.root.findByType("Modal").props.visible).toBe(false);
  expect(videos.get("first.mp4").playing).toBe(true);
  await act(async () => statusListeners.get("first.mp4")({ status: "error" }));
  expect(pageTouch(1, "Video unavailable. Retry")).toBeDefined();
  await act(async () =>
    pageTouch(1, "Video unavailable. Retry").props.onPress(),
  );
  expect(pageFor(1).findAllByType("VideoView")).toHaveLength(1);
  expect(videos.get("first.mp4").playing).toBe(true);
});
