import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let renderer;
let hook;
let browserReturn;
let completeReturn;
const start = mock(async () => "https://provider.example/authorize");
const complete = mock(async () => ({ installations: [] }));
const selectGithub = mock(async () => {});
const resumeGithubInstall = mock(async () => "https://provider.example/resume");
const browser = mock(
  () =>
    new Promise((resolve) => {
      browserReturn = resolve;
    }),
);
const actions = { start, complete, selectGithub, resumeGithubInstall };
mock.module("convex/react", () => ({ useAction: (name) => actions[name] }));
mock.module("@convex-dev/auth/react", () => ({
  useAuthToken: () =>
    `header.${btoa(JSON.stringify({ sub: "session" }))}.signature`,
}));
mock.module("expo-web-browser", () => ({ openAuthSessionAsync: browser }));
mock.module("../../backend/convex/_generated/api", () => ({
  api: {
    connections: {
      index: Object.fromEntries(Object.keys(actions).map((key) => [key, key])),
    },
  },
}));
const { useNativeConnections } =
  await import("../../../apps/mobile/src/features/studio/use-native-connections");
const { mobileConnectionReturnUrl } =
  await import("../../backend/convex/connections/mobile");
const callback = `${mobileConnectionReturnUrl}?state=mobile_${"a".repeat(43)}&provider=github&code=fixture`;
function Harness() {
  hook = useNativeConnections();
  return null;
}
const mount = () =>
  act(async () => {
    renderer = create(createElement(Harness));
  });
afterEach(async () => {
  await act(async () => renderer?.unmount());
  for (const action of Object.values(actions)) action.mockClear();
  complete.mockImplementation(async () => ({ installations: [] }));
  browser.mockClear();
});

test("browser and route callbacks redeem the same state once, regardless of parameter order", async () => {
  await mount();
  let pending;
  await act(async () => {
    pending = hook.connect("github");
  });
  await act(async () => {
    await hook.acceptCallback(callback);
  });
  await act(async () => {
    browserReturn({
      type: "success",
      url: `${mobileConnectionReturnUrl}?code=fixture&provider=github&state=mobile_${"a".repeat(43)}`,
    });
    await pending;
  });
  expect(complete).toHaveBeenCalledTimes(1);
  expect(hook.installNeeded).toBe(true);
});

test("a newly mounted session completes a route callback without a pending browser promise", async () => {
  await mount();
  await act(async () => {
    await hook.acceptCallback(callback);
  });
  expect(complete).toHaveBeenCalledTimes(1);
  expect(browser).not.toHaveBeenCalled();
});

test("sign-out while completion is pending never selects a GitHub installation", async () => {
  complete.mockImplementation(
    () =>
      new Promise((resolve) => {
        completeReturn = resolve;
      }),
  );
  await mount();
  let pending;
  await act(async () => {
    pending = hook.acceptCallback(callback);
  });
  await act(async () => renderer.unmount());
  await act(async () => {
    completeReturn({
      proof: "fixture",
      installations: [
        { installationId: "1", owner: "example", organization: false },
      ],
    });
    await pending;
  });
  expect(selectGithub).not.toHaveBeenCalled();
});
