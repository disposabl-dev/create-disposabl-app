import { expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let auth = { isAuthenticated: false, isLoading: true };
mock.module("convex/react", () => ({ useConvexAuth: () => auth }));
mock.module("../../disposabl-kit/features", () => ({
  authenticationEnabled: true,
}));
mock.module("../../../apps/mobile/src/features/studio/connections", () => ({
  ConnectionProvider: ({ children }) => children,
}));
mock.module("../../disposabl-kit/mobile/design/use-theme", () => ({
  useTheme: () => ({}),
}));
mock.module("../../disposabl-kit/mobile/design/theme-provider", () => ({
  useResolvedColorScheme: () => "light",
  useAccentColor: () => "blue",
}));
const Stack = ({ children }) => children;
Stack.Screen = (props) => createElement("Screen", props);
Stack.Protected = ({ guard, children }) => (guard ? children : null);
mock.module("expo-router", () => ({ Stack }));
mock.module("expo-router/native-tabs", () => ({ NativeTabs: () => null }));
const { StudioNavigation } =
  await import("../../../apps/mobile/src/features/studio/navigation");

test("connection callback route survives authentication hydration and closes for a signed-out session", async () => {
  let renderer;
  await act(async () => {
    renderer = create(createElement(StudioNavigation));
  });
  const connections = () =>
    renderer.root
      .findAllByType("Screen")
      .filter((screen) => screen.props.name === "connections");
  expect(connections()).toHaveLength(1);
  auth = { isAuthenticated: true, isLoading: false };
  await act(async () => renderer.update(createElement(StudioNavigation)));
  expect(connections()).toHaveLength(1);
  auth = { isAuthenticated: false, isLoading: false };
  await act(async () => renderer.update(createElement(StudioNavigation)));
  expect(connections()).toHaveLength(0);
  await act(async () => renderer.unmount());
});
