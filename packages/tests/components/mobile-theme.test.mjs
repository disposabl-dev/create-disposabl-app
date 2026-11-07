import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { createElement, useSyncExternalStore } from "react";
import { act, create } from "react-test-renderer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let osTheme = "light";
let override = "auto";
let selection;
let renderer;
const listeners = new Set();
const saved = new Map();
const appearance = {
  getColorScheme: () => (override === "auto" ? osTheme : override),
  setColorScheme: mock((value) => {
    override = value;
    listeners.forEach((notify) => notify());
  }),
};
const read = mock((key) => Promise.resolve(saved.get(key) ?? null));
mock.module("react-native", () => ({
  View: "View",
  Appearance: appearance,
  useColorScheme: () =>
    useSyncExternalStore((notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    }, appearance.getColorScheme),
}));
mock.module("react-native-css/native", () => ({
  useNativeVariable: () => "#123456",
}));
mock.module("expo-router", () => ({
  DarkTheme: { colors: {} },
  DefaultTheme: { colors: {} },
  ThemeProvider: "Navigation",
}));
mock.module("expo-status-bar", () => ({ StatusBar: "StatusBar" }));
mock.module("expo-secure-store", () => ({
  getItemAsync: read,
  setItemAsync: async (key, value) => {
    saved.set(key, value);
  },
}));
const {
  ThemeProvider,
  useThemePreference,
  useResolvedColorScheme,
  useAccentPreference,
} = await import("../../disposabl-kit/mobile/design/theme-provider");
function Probe() {
  selection = {
    ...useThemePreference(),
    ...useAccentPreference(),
    resolved: useResolvedColorScheme(),
  };
  return null;
}
const mount = () =>
  act(async () => {
    renderer = create(createElement(ThemeProvider, null, createElement(Probe)));
  });
beforeEach(() => {
  osTheme = "light";
  override = "auto";
  saved.clear();
  appearance.setColorScheme.mockClear();
  read.mockImplementation((key) => Promise.resolve(saved.get(key) ?? null));
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
});

test("theme and accent selections survive a remount", async () => {
  await mount();
  await act(async () => {
    selection.setPreference("dark");
    selection.setAccent("purple");
  });
  expect(selection.resolved).toBe("dark");
  expect(appearance.setColorScheme).toHaveBeenLastCalledWith("dark");
  expect(saved.get("app-theme")).toBe("dark");
  expect(saved.get("app-accent")).toBe("purple");
  await act(async () => renderer.unmount());
  await mount();
  expect(selection.preference).toBe("dark");
  expect(selection.accent).toBe("purple");
  await act(async () => selection.setPreference("light"));
  expect(selection.resolved).toBe("light");
  expect(appearance.setColorScheme).toHaveBeenLastCalledWith("light");
  expect(saved.get("app-theme")).toBe("light");
});

test("System removes the native override and follows later OS changes", async () => {
  await mount();
  await act(async () => selection.setPreference("dark"));
  await act(async () => selection.setPreference("system"));
  expect(appearance.setColorScheme).toHaveBeenLastCalledWith("auto");
  expect(selection.resolved).toBe("light");
  const overrides = appearance.setColorScheme.mock.calls.length;
  await act(async () => {
    osTheme = "dark";
    listeners.forEach((notify) => notify());
  });
  expect(selection.resolved).toBe("dark");
  expect(appearance.setColorScheme.mock.calls.length).toBe(overrides);
});

test("a delayed stored preference cannot replace a user's new choice", async () => {
  let finish;
  read.mockImplementation((key) =>
    key === "app-theme"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(null),
  );
  await mount();
  await act(async () => selection.setPreference("dark"));
  await act(async () => finish("light"));
  expect(selection.preference).toBe("dark");
});
