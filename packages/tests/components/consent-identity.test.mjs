import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { getFunctionName } from "convex/server";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let token = "alice",
  authenticated = true,
  loading = false;
let account = { username: "alice", email: null, profile: null },
  user = { id: "user-a", username: "alice" };
let queue = null;
let calls = [];
const convex = { url: "http://127.0.0.1:3540" };
const request = {
  kind: "redirect",
  status: "pending",
  clientName: "Client",
  serverName: "Service",
  scopes: [],
  redirectUri: "http://localhost/callback",
};
mock.module("@convex-dev/auth/react", () => ({ useAuthToken: () => token }));
mock.module("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth(value) {
      this.token = value;
    }
    query(reference) {
      const name = getFunctionName(reference);
      calls.push([this.token, name]);
      if (queue) return queue[name];
      return Promise.resolve(name === "auth:account" ? account : user);
    }
  },
}));
mock.module("convex/react", () => ({
  useConvex: () => convex,
  useConvexAuth: () => ({ isAuthenticated: authenticated, isLoading: loading }),
  useQuery: () => request,
  useAction: () => async () => ({}),
}));
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (config) => ({
    ...config,
    useSearch: () => ({ request: "request" }),
  }),
  Navigate: () => null,
}));
mock.module("../../disposabl-kit/client/components/ui/button", () => ({
  Button: ({ children, ...props }) => createElement("button", props, children),
}));
const { Route } = await import("../../disposabl-kit/client/routes/consent");
let renderer;
const render = async () =>
  act(async () => {
    renderer = create(createElement(Route.component));
  });
const refresh = async () =>
  act(async () => {
    renderer.update(createElement(Route.component));
  });
const text = () => JSON.stringify(renderer.toJSON());
const allow = () =>
  renderer.root
    .findAllByType("button")
    .find((b) => b.props.children === "Allow");
afterEach(async () => {
  await act(async () => renderer?.unmount());
  token = "alice";
  authenticated = true;
  loading = false;
  account = { username: "alice", email: null, profile: null };
  user = { id: "user-a", username: "alice" };
  queue = null;
  calls = [];
});
test("username, verified email, profile and stable id are displayed", async () => {
  await render();
  expect(text()).toContain("alice");
  expect(allow().props.disabled).toBe(false);
  for (const [value, expected] of [
    [
      { username: null, email: "verified@example.test", profile: null },
      "verified@example.test",
    ],
    [
      {
        username: null,
        email: null,
        profile: { email: "google@example.test" },
      },
      "google@example.test",
    ],
    [
      { username: null, email: null, profile: { name: "Google Name" } },
      "Google Name",
    ],
    [{ username: null, email: null, profile: null }, "user-a"],
  ]) {
    token += "x";
    account = value;
    await refresh();
    expect(text()).toContain(expected);
    expect(allow().props.disabled).toBe(false);
  }
});
test("loading and unavailable block approval; stale account never survives token change", async () => {
  await render();
  expect(allow().props.disabled).toBe(false);
  let finishAccount, finishUser;
  queue = {
    "auth:account": new Promise((r) => {
      finishAccount = r;
    }),
    "users/index:current": new Promise((r) => {
      finishUser = r;
    }),
  };
  token = "bob";
  await refresh();
  expect(text()).toContain("Loading your account");
  expect(text()).not.toContain("alice");
  expect(allow().props.disabled).toBe(true);
  await act(async () => {
    finishAccount({ username: "bob", email: null, profile: null });
    finishUser({ id: "user-b", username: "bob" });
  });
  expect(text()).toContain("bob");
  expect(allow().props.disabled).toBe(false);
  token = "charlie";
  queue = null;
  account = null;
  await refresh();
  expect(text()).toContain("could not be loaded");
  expect(allow().props.disabled).toBe(true);
  loading = true;
  await refresh();
  expect(allow()).toBeUndefined();
});

test("late account response cannot overwrite a newer account", async () => {
  let finishOldAccount, finishOldUser;
  queue = {
    "auth:account": new Promise((r) => {
      finishOldAccount = r;
    }),
    "users/index:current": new Promise((r) => {
      finishOldUser = r;
    }),
  };
  await render();
  expect(allow().props.disabled).toBe(true);
  token = "bob";
  queue = null;
  account = { username: "bob", email: null, profile: null };
  user = { id: "user-b", username: "bob" };
  await refresh();
  expect(text()).toContain("bob");
  await act(async () => {
    finishOldAccount({ username: "alice", email: null, profile: null });
    finishOldUser({ id: "user-a", username: "alice" });
  });
  expect(text()).toContain("bob");
  expect(text()).not.toContain("alice");
});

test("failed account lookup leaves approval unavailable", async () => {
  queue = {
    "auth:account": Promise.reject(new Error("offline")),
    "users/index:current": Promise.resolve(user),
  };
  await render();
  expect(text()).toContain("could not be loaded");
  expect(allow().props.disabled).toBe(true);
});
