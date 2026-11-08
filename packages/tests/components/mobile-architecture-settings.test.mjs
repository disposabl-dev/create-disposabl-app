import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { getFunctionName } from "convex/server";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const applied = {
  appId: "owned-app",
  platforms: ["web", "android"],
  features: [],
  androidArchitectures: ["arm64-v8a", "x86_64"],
};
const request = mock(async () => ({ status: "processing" }));
mock.module("react-native", () => ({
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  Linking: { openURL: mock() },
}));
mock.module("convex/react", () => ({
  useAction: () => request,
  useQuery: (ref) => {
    const name = getFunctionName(ref);
    if (name === "apps/index:get") return applied;
    if (name === "releases/index:get") return null;
    if (name === "previews/index:list")
      return { page: [], isDone: true, continueCursor: "" };
    throw new Error(`Unexpected query: ${name}`);
  },
}));
mock.module("../../../apps/mobile/src/features/management/ui", () => ({
  Button: "Button",
  Loading: "Loading",
}));
mock.module(
  "../../../apps/mobile/src/features/management/installer-button",
  () => ({ InstallerButton: "InstallerButton" }),
);
const { Details } =
  await import("../../../apps/mobile/src/features/management/details");
let renderer;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  request.mockClear();
});

test("architecture selection queues a request while applied configuration remains unchanged", async () => {
  await act(async () => {
    renderer = create(createElement(Details, { appId: applied.appId }));
  });
  const checkbox = (label) =>
    renderer.root.findByProps({ accessibilityLabel: label });
  const arm = () => checkbox("Modern phones (ARM64)");
  const x86 = () => checkbox("Emulators (x86_64)");
  expect(arm().props.accessibilityState.checked).toBe(true);
  expect(x86().props.accessibilityState.checked).toBe(true);
  await act(async () => x86().props.onPress());
  expect(x86().props.accessibilityState.checked).toBe(false);
  expect(arm().props.accessibilityState.disabled).toBe(true);
  expect(arm().props.disabled).toBe(true);
  await act(async () =>
    renderer.root.findByProps({ title: "Save selection" }).props.onPress(),
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toMatchObject({
    appId: "owned-app",
    androidArchitectures: ["arm64-v8a"],
  });
  expect(applied.androidArchitectures).toEqual(["arm64-v8a", "x86_64"]);
  expect(
    renderer.root
      .findAllByType("Text")
      .some((node) =>
        String(node.props.children).includes("Change requested."),
      ),
  ).toBe(true);
  await act(async () => {
    renderer.unmount();
    renderer = create(createElement(Details, { appId: applied.appId }));
  });
  expect(applied.androidArchitectures).toEqual(["arm64-v8a", "x86_64"]);
  expect(arm().props.accessibilityState.checked).toBe(true);
  expect(x86().props.accessibilityState.checked).toBe(true);
});
