import { expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { getFunctionName } from "convex/server";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let preview = {
  reference: "main",
  platforms: {
    web: { url: "https://example.invalid", latest: { status: "ready" } },
  },
};
const push = mock();
mock.module("convex/react", () => ({
  useQuery: (ref) =>
    getFunctionName(ref) === "apps/index:get"
      ? { name: "My app" }
      : { page: preview ? [preview] : [] },
}));
mock.module("nativewind", () => ({
  VariableContextProvider: ({ children }) => children,
}));
mock.module("expo-router", () => ({
  Stack: { Screen: "Screen" },
  useRouter: () => ({ push, canGoBack: () => true, back: () => {} }),
}));
mock.module("react-native", () => ({
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
  useWindowDimensions: () => ({ width: 390 }),
}));
mock.module("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ left: 0, right: 0 }),
}));
mock.module(
  "../../../../packages/disposabl-kit/mobile/design/nativewind",
  () => ({ MenuView: "MenuView" }),
);
mock.module("../../../../apps/mobile/src/features/studio/ui", () => ({
  Icon: "Icon",
}));
const { ConversationHeader } =
  await import("../../../../apps/mobile/src/features/management/conversation-header");

test("ready preview retains its reference while the menu only opens app settings", async () => {
  let screen, title, right;
  await act(async () => {
    screen = create(createElement(ConversationHeader, { appId: "app-1" }));
  });
  const options = screen.root.findByType("Screen").props.options;
  await act(async () => {
    title = create(options.headerTitle());
    right = create(options.headerRight());
  });
  expect(JSON.stringify(title.toJSON())).toContain("main");
  const menu = right.root.findByType("MenuView");
  expect(menu.props.actions).toEqual([
    { id: "settings", title: "App settings" },
  ]);
  menu.props.onPressAction({ nativeEvent: { event: "settings" } });
  expect(push).toHaveBeenCalledWith({
    pathname: "/apps/[appId]/details",
    params: { appId: "app-1" },
  });
  menu.props.onPressAction({ nativeEvent: { event: "preview" } });
  expect(push).toHaveBeenCalledTimes(1);
  await act(async () => {
    title.unmount();
    right.unmount();
    screen.unmount();
  });
});
