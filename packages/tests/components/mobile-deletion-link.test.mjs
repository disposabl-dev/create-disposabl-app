import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const enabled = process.env.TEST_AUTH_DISABLED !== "true";
const open = mock(async () => {});
process.env.EXPO_PUBLIC_CONVEX_SITE_URL = "https://example.test";
mock.module("../../disposabl-kit/features", () => ({
  authenticationEnabled: enabled,
}));
mock.module("react-native", () => ({ Alert: { alert: mock() } }));
mock.module("expo-web-browser", () => ({ openBrowserAsync: open }));
mock.module("../../disposabl-kit/mobile/design/preferences", () => ({
  PreferenceRow: "Row",
  PreferenceSection: "Section",
  PreferenceSeparator: "Separator",
}));
const { SettingsLinks } =
  await import("../../disposabl-kit/mobile/components/settings-links");
let renderer;
afterEach(async () => {
  await act(async () => renderer?.unmount());
});
test("delete account is linked only when authentication is enabled", async () => {
  await act(async () => {
    renderer = create(createElement(SettingsLinks));
  });
  const rows = renderer.root.findAllByType("Row");
  const deletion = rows.find((row) => row.props.label === "Delete account");
  if (!enabled) {
    expect(deletion).toBeUndefined();
    return;
  }
  expect(deletion).toBeDefined();
  await act(async () => deletion.props.onPress());
  expect(open).toHaveBeenCalledWith(
    "https://example.test/legal/delete-account",
  );
});
