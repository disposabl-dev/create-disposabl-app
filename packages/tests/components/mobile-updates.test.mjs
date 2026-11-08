import { afterEach, beforeEach, mock, test, expect } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
Object.assign(globalThis, { __DEV__: !1, IS_REACT_ACT_ENVIRONMENT: !0 });
const state = {
    isUpdatePending: !0,
    isStartupProcedureRunning: !1,
    isChecking: !1,
    isDownloading: !1,
  },
  app = {
    currentState: "active",
    addEventListener: (_, listener) => {
      onChange = listener;
      return {
        remove: () => {
          onChange = () => {};
        },
      };
    },
  };
let onChange = (_) => {},
  clock = 0,
  renderer;
const now = Date.now,
  priorE2E = process.env.EXPO_PUBLIC_E2E,
  check = mock(async () => ({
    isAvailable: !1,
    isRollBackToEmbedded: !1,
  })),
  fetchUpdate = mock(async () => ({
    isNew: !1,
    isRollBackToEmbedded: !1,
  })),
  reload = mock(async () => {});
mock.module("expo-updates", () => ({
  useUpdates: () => state,
  isEnabled: !0,
  isEmbeddedLaunch: !1,
  checkForUpdateAsync: check,
  fetchUpdateAsync: fetchUpdate,
  reloadAsync: reload,
}));
mock.module("nativewind", () => ({
  VariableContextProvider: ({ children }) => children,
}));
mock.module("react-native", () => ({
  Alert: { alert: () => {} },
  AppState: app,
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
}));
mock.module("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));
const { UpdatePrompt } =
  await import("../../disposabl-kit/mobile/updates/update-prompt");
beforeEach(() => {
  delete process.env.EXPO_PUBLIC_E2E;
  Date.now = () => clock;
  clock = 0;
  app.currentState = "active";
  Object.assign(state, {
    isUpdatePending: !0,
    isStartupProcedureRunning: !1,
    isChecking: !1,
    isDownloading: !1,
  });
  check.mockClear();
  fetchUpdate.mockClear();
  reload.mockClear();
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = void 0;
  Date.now = now;
  if (priorE2E === void 0) delete process.env.EXPO_PUBLIC_E2E;
  else process.env.EXPO_PUBLIC_E2E = priorE2E;
});
async function mount() {
  await act(async () => {
    renderer = create(createElement(UpdatePrompt, null, "content"));
  });
}
async function transition(next, elapsed = 0) {
  await act(async () => {
    clock += elapsed;
    app.currentState = next;
    onChange(next);
  });
}
async function renderState() {
  await act(async () => {
    renderer.update(createElement(UpdatePrompt, null, "content"));
  });
}
test("no-update response preserves the native cached-update banner", async () => {
  await mount();
  await transition("background");
  await transition("active", 300000);
  expect(check).toHaveBeenCalledTimes(1);
  expect(fetchUpdate).toHaveBeenCalledTimes(0);
  expect(JSON.stringify(renderer.toJSON())).toContain("Update now");
  expect(reload).toHaveBeenCalledTimes(0);
  state.isUpdatePending = !1;
  await renderState();
  expect(JSON.stringify(renderer.toJSON())).not.toContain("Update now");
});
test("a long-inactive check waits for a failing native download to become idle", async () => {
  state.isDownloading = !0;
  await mount();
  await transition("background");
  await transition("active", 300000);
  expect(check).toHaveBeenCalledTimes(0);
  state.isDownloading = !1;
  state.isUpdatePending = !1;
  await renderState();
  expect(check).toHaveBeenCalledTimes(1);
  await renderState();
  await transition("active");
  expect(check).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledTimes(0);
});
test("deferred work stays paused in the background and is discarded on unmount", async () => {
  state.isDownloading = !0;
  await mount();
  await transition("background");
  await transition("active", 300000);
  await transition("background");
  state.isDownloading = !1;
  await renderState();
  expect(check).toHaveBeenCalledTimes(0);
  await transition("active", 1000);
  expect(check).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
  renderer = void 0;
  await transition("background");
  await transition("active", 300000);
  expect(check).toHaveBeenCalledTimes(1);
});
