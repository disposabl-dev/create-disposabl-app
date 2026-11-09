import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { getFunctionName } from "convex/server";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const jwt = (subject) =>
  `header.${Buffer.from(JSON.stringify({ sub: subject })).toString("base64url")}.signature`;
let token = jwt("alice"),
  authenticated = true,
  loading = false;
let account = { username: "alice", email: null, profile: null };
let user = { id: "user-a", username: "alice" };
let pending = null;
const convex = { url: "http://127.0.0.1:3540" };
mock.module("@convex-dev/auth/react", () => ({ useAuthToken: () => token }));
mock.module("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth() {}
    query(reference) {
      const name = getFunctionName(reference);
      return pending
        ? pending[name]
        : Promise.resolve(name === "auth:account" ? account : user);
    }
  },
}));
mock.module("convex/react", () => ({
  useConvex: () => convex,
  useConvexAuth: () => ({ isAuthenticated: authenticated, isLoading: loading }),
  useQuery: () => undefined,
  useAction: () => async () => ({
    balance: 42,
    hasMonthlyPlan: false,
    checkoutNeedsReview: false,
    customerId: "user-a",
  }),
}));
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (config) => config,
}));
mock.module("../../disposabl-kit/features", () => ({ paymentsEnabled: true }));
const { Pricing } = await import("../../disposabl-kit/client/routes/pricing");
let renderer;
const render = async () =>
  act(async () => {
    renderer = create(createElement(Pricing));
  });
const refresh = async () =>
  act(async () => {
    renderer.update(createElement(Pricing));
  });
const text = () => JSON.stringify(renderer.toJSON());
afterEach(async () => {
  await act(async () => renderer?.unmount());
  token = jwt("alice");
  authenticated = true;
  loading = false;
  account = { username: "alice", email: null, profile: null };
  user = { id: "user-a", username: "alice" };
  pending = null;
});

test("shows the authenticated account and retains anonymous pricing", async () => {
  await render();
  expect(text()).toContain("Signed in as");
  expect(text()).toContain("alice");
  authenticated = false;
  token = null;
  await refresh();
  expect(text()).toContain("Sign in");
  expect(text()).not.toContain("alice");
  expect(text()).not.toContain("Signed in as");
});

test("does not show a prior account while switching or after an old response", async () => {
  await render();
  let resolveAccount, resolveUser;
  pending = {
    "auth:account": new Promise((resolve) => {
      resolveAccount = resolve;
    }),
    "users/index:current": new Promise((resolve) => {
      resolveUser = resolve;
    }),
  };
  token = jwt("bob");
  await refresh();
  expect(text()).toContain("Loading your account");
  expect(text()).not.toContain("alice");
  token = jwt("charlie");
  pending = null;
  account = { username: "charlie", email: null, profile: null };
  user = { id: "user-c", username: "charlie" };
  await refresh();
  expect(text()).toContain("charlie");
  await act(async () => {
    resolveAccount({ username: "bob", email: null, profile: null });
    resolveUser({ id: "user-b", username: "bob" });
  });
  expect(text()).toContain("charlie");
  expect(text()).not.toContain("bob");
});

test("reports identity lookup failure without inventing a label", async () => {
  pending = {
    "auth:account": Promise.reject(new Error("offline")),
    "users/index:current": Promise.resolve(user),
  };
  await render();
  expect(text()).toContain("Your account could not be loaded");
  expect(text()).not.toContain("Signed in as");
});
