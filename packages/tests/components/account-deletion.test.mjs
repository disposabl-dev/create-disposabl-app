import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const authEnabled = process.env.TEST_AUTH_DISABLED !== "true";
let authenticated = false,
  loading = false,
  status = null,
  queryFails = false;
let mutation = mock(async () => ({
  status: "requested",
  requestedAt: 1700000000000,
  reference: "fixture-reference",
}));
mock.module("../../disposabl-kit/features", () => ({
  authenticationEnabled: authEnabled,
}));
mock.module("convex/react", () => ({
  useConvexAuth: () => {
    if (!authEnabled) throw new Error("Auth hook without provider");
    return { isAuthenticated: authenticated, isLoading: loading };
  },
  useQuery: () => {
    if (queryFails) throw new Error("offline");
    return status;
  },
  useMutation:
    () =>
    (...args) =>
      mutation(...args),
}));
const { AccountDeletion } =
  await import("../../disposabl-kit/client/components/account-deletion");
let renderer;
async function render() {
  await act(async () => {
    renderer = create(createElement(AccountDeletion));
  });
}
async function refresh() {
  await act(async () => renderer.update(createElement(AccountDeletion)));
}
const text = () => JSON.stringify(renderer.toJSON());
const buttons = () => renderer.root.findAllByType("button");
afterEach(async () => {
  await act(async () => renderer?.unmount());
  authenticated = loading = queryFails = false;
  status = null;
  mutation = mock(async () => ({
    status: "requested",
    requestedAt: 1700000000000,
    reference: "fixture-reference",
  }));
});

test("auth disabled avoids hooks; guests get sign in", async () => {
  await render();
  if (!authEnabled) return expect(renderer.toJSON()).toBeNull();
  expect(renderer.root.findByType("a").props.href).toBe(
    "/login?returnTo=%2Flegal%2Fdelete-account",
  );
  expect(buttons()).toHaveLength(0);
});

test("loading and recorded status preserve access without claiming completion", async () => {
  if (!authEnabled) return;
  authenticated = true;
  loading = true;
  await render();
  expect(text()).toContain("Loading account");
  loading = false;
  status = undefined;
  await refresh();
  expect(text()).toContain("Loading deletion request status");
  status = {
    status: "requested",
    requestedAt: 1700000000000,
    reference: "fixture-reference",
  };
  await refresh();
  expect(text()).toContain("Account deletion requested on");
  expect(text()).toContain("deletion is not confirmed");
  expect(buttons()).toHaveLength(0);
  const link = renderer.root.findByType("a");
  expect(link.props.download).toBe("deletion-request-fixture-reference.txt");
  const receipt = decodeURIComponent(link.props.href.split(",")[1]);
  expect(receipt).toContain("Reference: fixture-reference");
  expect(receipt).toContain("Publisher: Yast AI");
  expect(receipt).toContain("Support: vivek@yast.ai");
  expect(receipt).toContain("Status: requested");
  expect(receipt).toContain("Deletion is not confirmed.");
});

test("confirmation, cancel, in-flight lock and mutation response survive stale query", async () => {
  if (!authEnabled) return;
  authenticated = true;
  let resolve;
  mutation = mock(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await render();
  await act(async () => buttons()[0].props.onClick());
  expect(buttons()[0].props.disabled).toBe(true);
  await act(async () => buttons()[1].props.onClick());
  expect(mutation).not.toHaveBeenCalled();
  await act(async () => buttons()[0].props.onClick());
  await act(async () =>
    renderer.root
      .findByType("input")
      .props.onChange({ target: { value: "DELETE" } }),
  );
  await act(async () => {
    buttons()[0].props.onClick();
    buttons()[0].props.onClick();
  });
  expect(mutation).toHaveBeenCalledTimes(1);
  expect(mutation).toHaveBeenCalledWith({ confirmation: "DELETE" });
  expect(text()).toContain("Submitting your request");
  expect(buttons().every((button) => button.props.disabled)).toBe(true);
  await act(async () =>
    resolve({
      status: "requested",
      requestedAt: 1700000000000,
      reference: "fixture-reference",
    }),
  );
  expect(text()).toContain("deletion is not confirmed");
  await refresh();
  expect(text()).toContain("Account deletion requested on");
});

test("ambiguous mutation failure asks to check status; later query wins", async () => {
  if (!authEnabled) return;
  authenticated = true;
  mutation = mock(async () => {
    throw new Error("offline");
  });
  await render();
  await act(async () => buttons()[0].props.onClick());
  await act(async () =>
    renderer.root
      .findByType("input")
      .props.onChange({ target: { value: "DELETE" } }),
  );
  await act(async () => buttons()[0].props.onClick());
  expect(text()).toContain("could not confirm your request");
  status = {
    status: "requested",
    requestedAt: 1700000000000,
    reference: "fixture-reference",
  };
  await refresh();
  expect(text()).toContain("Account deletion requested on");
});

test("query failure does not offer a request", async () => {
  if (!authEnabled) return;
  authenticated = true;
  queryFails = true;
  const previous = console.error;
  console.error = () => {};
  try {
    await render();
  } finally {
    console.error = previous;
  }
  expect(text()).toContain("could not load your deletion request status");
  expect(buttons()).toHaveLength(0);
});

test("legacy request can create a receipt without a new request", async () => {
  if (!authEnabled) return;
  authenticated = true;
  status = { status: "requested", requestedAt: 1700000000000, reference: null };
  await render();
  expect(text()).toContain("Create request receipt");
  await act(async () => buttons()[0].props.onClick());
  expect(mutation).toHaveBeenCalledWith({});
  expect(text()).toContain("fixture-reference");
});
