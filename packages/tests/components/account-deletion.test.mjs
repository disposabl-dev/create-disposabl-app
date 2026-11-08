import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let authenticated = false;
const authEnabled = process.env.TEST_AUTH_DISABLED !== "true";
mock.module("../../disposabl-kit/features", () => ({
  authenticationEnabled: authEnabled,
}));
mock.module("convex/react", () => ({
  useConvexAuth: () => {
    if (!authEnabled) throw new Error("Auth hook without provider");
    return { isAuthenticated: authenticated, isLoading: false };
  },
}));
const { AccountDeletion, DeletionPanel } =
  await import("../../disposabl-kit/client/components/account-deletion");
let renderer;
async function render(element) {
  await act(async () => {
    renderer = create(element);
  });
}
const text = () => JSON.stringify(renderer.toJSON());
afterEach(async () => {
  await act(async () => renderer?.unmount());
  authenticated = false;
});

test("anonymous users get sign-in when authentication is enabled", async () => {
  await render(createElement(AccountDeletion));
  if (authEnabled) {
    expect(text()).toContain("Sign in to manage your account deletion request");
    expect(renderer.root.findByType("a").props.href).toBe(
      "/login?returnTo=%2Flegal%2Fdelete-account",
    );
  } else expect(renderer.toJSON()).toBeNull();
});

test("signed-in users see unavailable until the backend is wired", async () => {
  if (!authEnabled) return;
  authenticated = true;
  await render(createElement(AccountDeletion));
  expect(text()).toContain("Account deletion requests are not available yet");
  expect(renderer.root.findAllByType("button")).toHaveLength(0);
});

test("confirmation can be cancelled and only confirm invokes the request", async () => {
  const request = mock();
  await render(
    createElement(DeletionPanel, { state: "idle", onRequest: request }),
  );
  await act(async () =>
    renderer.root.findAllByType("button")[0].props.onClick(),
  );
  expect(text()).toContain("Confirm deletion request");
  await act(async () =>
    renderer.root.findAllByType("button")[1].props.onClick(),
  );
  expect(request).not.toHaveBeenCalled();
  await act(async () =>
    renderer.root.findAllByType("button")[0].props.onClick(),
  );
  await act(async () =>
    renderer.root.findAllByType("button")[0].props.onClick(),
  );
  expect(request).toHaveBeenCalledTimes(1);
});

test("pending, failure and completed states do not conflate request and deletion", async () => {
  await render(createElement(DeletionPanel, { state: "pending" }));
  expect(text()).toContain("Your account has not yet been deleted");
  await act(async () =>
    renderer.update(createElement(DeletionPanel, { state: "failed" })),
  );
  expect(text()).toContain("could not confirm your deletion request");
  await act(async () =>
    renderer.update(createElement(DeletionPanel, { state: "completed" })),
  );
  expect(text()).toContain("Your account deletion has been completed");
});
