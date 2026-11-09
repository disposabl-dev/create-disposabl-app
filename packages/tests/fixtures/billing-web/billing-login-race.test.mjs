import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
class TestWindow extends EventTarget {}
const win = new TestWindow();
globalThis.window = win;
win.self = win;
win.top = win;
win.location = {
  pathname: "/billing-login",
  hash: "#A",
  replace: mock(() => {}),
};
win.history = {
  state: {},
  replaceState: mock(() => {
    win.location.hash = "";
  }),
};
const stored = new Map();
win.sessionStorage = { setItem: (key, value) => stored.set(key, value) };
const names = { A: "@alice", B: "@bob", expired: null };
const exchange = mock(async () => ({
  userId: "user",
  accessToken: "access",
  refreshToken: "refresh",
  refreshTokenExpiresAt: 1,
  purchase: "topup",
  expiresAt: 99,
  returnClaim: null,
}));
const setSession = mock(async () => {});
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options) => options,
}));
mock.module("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ setSession }),
}));
mock.module("convex/react", () => ({
  useMutation: () => exchange,
  useQuery: (_ref, args) =>
    args === "skip"
      ? undefined
      : names[args.code]
        ? { name: names[args.code] }
        : null,
}));
mock.module("../../../disposabl-kit/client/components/ui/button", () => ({
  Button: ({ children, ...props }) => createElement("button", props, children),
}));
mock.module("../../../disposabl-kit/client/components/password-page", () => ({
  PasswordPage: ({ children }) => createElement("main", null, children),
}));
const { Route } =
  await import("../../../disposabl-kit/client/routes/billing-login");
let renderer;
const text = () => JSON.stringify(renderer.toJSON());
const button = () => renderer.root.findAllByType("button")[0];
const mount = async () =>
  act(async () => {
    renderer = create(createElement(Route.component));
  });
const change = async (value) =>
  act(async () => {
    win.location.hash = value ? `#${value}` : "";
    const event = new Event("hashchange");
    Object.defineProperty(event, "newURL", {
      value: `https://fixture.invalid/billing-login${win.location.hash}`,
    });
    win.dispatchEvent(event);
  });
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  win.top = win;
  win.location.hash = "#A";
  stored.clear();
  exchange.mockClear();
  setSession.mockClear();
  win.location.replace.mockClear();
});

test("new fragment replaces old consent and fences late redemption", async () => {
  let resolve;
  exchange.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await mount();
  expect(win.location.hash).toBe("");
  expect(text()).toContain("@alice");
  await act(async () => button().props.onClick());
  await change("B");
  expect(win.location.hash).toBe("");
  expect(text()).toContain("@bob");
  expect(text()).not.toContain("@alice");
  await act(async () =>
    resolve({
      userId: "alice",
      accessToken: "old",
      refreshToken: "old",
      refreshTokenExpiresAt: 1,
      purchase: "topup",
      expiresAt: 99,
      returnClaim: null,
    }),
  );
  expect(setSession).not.toHaveBeenCalled();
  expect(stored.size).toBe(0);
  expect(win.location.replace).not.toHaveBeenCalled();
  expect(text()).toContain("@bob");
});

test("new consent waits for already-started session adoption, without old navigation", async () => {
  let finish;
  setSession.mockImplementationOnce(
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  await mount();
  await act(async () => button().props.onClick());
  expect(setSession).toHaveBeenCalledTimes(1);
  await change("B");
  expect(text()).toContain("@bob");
  expect(button().props.disabled).toBe(true);
  await act(async () => finish());
  expect(win.location.replace).not.toHaveBeenCalled();
  expect(stored.size).toBe(0);
  expect(button().props.disabled).toBe(false);
  await act(async () => button().props.onClick());
  expect(exchange.mock.calls.at(-1)).toEqual([{ code: "B" }]);
  expect(setSession).toHaveBeenCalledTimes(2);
  expect(win.location.replace).toHaveBeenCalledWith("/pricing?source=ios");
});

test("expired and empty fragments discard stale errors; framed pages remain closed", async () => {
  exchange.mockRejectedValueOnce(new Error("synthetic"));
  await mount();
  await act(async () => button().props.onClick());
  expect(text()).toContain("could not sign you in");
  await change("expired");
  expect(text()).toContain("expired");
  expect(text()).not.toContain("could not sign you in");
  await change("");
  expect(text()).toContain("expired");
  expect(renderer.root.findAllByType("button")).toHaveLength(0);
  await act(async () => renderer.unmount());
  renderer = undefined;
  win.top = {};
  win.location.hash = "#A";
  await mount();
  expect(win.location.hash).toBe("");
  expect(text()).toContain("Open this link directly");
  expect(renderer.root.findAllByType("button")).toHaveLength(0);
});
