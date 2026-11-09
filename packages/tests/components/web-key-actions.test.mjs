import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
class TestWindow extends EventTarget {}
globalThis.window = new TestWindow();
window.location = { pathname: "/dashboard/api-keys" };
globalThis.Element = class {
  closest() {
    return null;
  }
};
const values = new Map();
globalThis.localStorage = {
  getItem: (k) => values.get(k) ?? null,
  setItem: (k, v) => values.set(k, v),
};
const copied = mock(async () => {});
Object.defineProperty(globalThis, "navigator", {
  value: { doNotTrack: "0", clipboard: { writeText: copied } },
  configurable: true,
});
process.env.PROD = "true";
process.env.VITE_CONVEX_SITE_URL = "http://127.0.0.1:9999";
process.env.VITE_DISPOSABL_ANALYTICS_ENABLED = "true";
const events = [];
const request = mock(async function () {
  if (this !== window) throw new TypeError("Illegal invocation");
  return Response.json({
    enabled: true,
    projectToken: "phc_fixture",
    host: "https://us.i.posthog.com",
    anonymousId: "00000000-0000-4000-8000-000000000001",
    distinctId: "fixture-id",
    identified: false,
    expiresAt: Date.now() + 30000,
  });
});
globalThis.fetch = request;
mock.module("posthog-js", () => ({
  PostHog: class {
    init(_key, options) {
      this.options = options;
    }
    capture(event, properties = {}) {
      const result = this.options.before_send({
        uuid: "fixture",
        event,
        properties,
      });
      if (result) events.push(result);
    }
    opt_out_capturing() {}
    reset() {}
  },
}));
const createKey = mock(async () => ({ apiKey: "SECRET_KEY_91" }));
const revokeKey = mock(async () => {});
mock.module("convex/react", () => ({
  useAction: () => createKey,
  useMutation: () => revokeKey,
  useQuery: () => [
    {
      kind: "apiKey",
      id: "SECRET_ID_91",
      name: "SECRET_NAME_91",
      createdAt: 0,
    },
  ],
}));
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options) => options,
}));
mock.module("@disposabl/disposabl-kit/client/components/ui/button", () => ({
  Button: ({ children, ...props }) => createElement("button", props, children),
}));
mock.module("@disposabl/disposabl-kit/client/components/ui/input", () => ({
  Input: (props) => createElement("input", props),
}));
const { ProductTelemetry, AnalyticsPreference, captureProductAction } =
  await import("../../../apps/web/src/telemetry");
const { Route } =
  await import("../../../apps/web/src/router/_authenticated/dashboard.api-keys");
let renderer;
const mount = async (e2e) => {
  process.env.VITE_E2E = e2e ? "true" : "false";
  await act(async () => {
    renderer = create(
      createElement(
        "Root",
        null,
        createElement(ProductTelemetry, {
          pathname: "/dashboard/api-keys",
          token: null,
          ready: true,
        }),
        createElement(AnalyticsPreference),
        createElement(Route.component),
      ),
    );
  });
};
const actions = () =>
  events
    .filter((e) => e.event === "product_action")
    .map((e) => e.properties.action);
const button = (label) =>
  renderer.root
    .findAllByType("button")
    .find((node) => node.children.includes(label));
const submit = async () =>
  act(async () =>
    renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  events.length = 0;
  values.clear();
  request.mockClear();
  createKey.mockClear();
  revokeKey.mockClear();
  copied.mockClear();
});

test("actual keyboard submit, copy and revoke emit only fixed attempts", async () => {
  await mount(false);
  await submit();
  expect(createKey).not.toHaveBeenCalled();
  expect(actions()).toEqual([]);
  await act(async () =>
    renderer.root
      .findByType("input")
      .props.onChange({ target: { value: "SECRET_INPUT_91" } }),
  );
  const bubbledClick = new Event("click");
  Object.defineProperty(bubbledClick, "target", { value: new Element() });
  window.dispatchEvent(bubbledClick);
  await submit();
  expect(createKey).toHaveBeenCalledTimes(1);
  expect(actions()).toEqual(["api_key_create_attempt"]);
  await submit();
  expect(createKey).toHaveBeenCalledTimes(1);
  await act(async () => button("Copy key").props.onClick());
  await act(async () => button("Revoke").props.onClick());
  expect(copied).toHaveBeenCalledTimes(1);
  expect(revokeKey).toHaveBeenCalledTimes(1);
  expect(actions()).toEqual([
    "api_key_create_attempt",
    "api_key_copy_attempt",
    "api_key_revoke_attempt",
  ]);
  captureProductAction("SECRET_INVALID_91");
  expect(actions()).toHaveLength(3);
  for (const marker of [
    "SECRET_KEY_91",
    "SECRET_ID_91",
    "SECRET_NAME_91",
    "SECRET_INPUT_91",
  ])
    expect(JSON.stringify(events)).not.toContain(marker);
});

test("pending creation guards additional submissions and revoke", async () => {
  let resolve;
  createKey.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await mount(false);
  await act(async () =>
    renderer.root
      .findByType("input")
      .props.onChange({ target: { value: "SECRET_INPUT_91" } }),
  );
  await act(async () => {
    void renderer.root
      .findByType("form")
      .props.onSubmit({ preventDefault() {} });
  });
  expect(button("Create key").props.disabled).toBe(true);
  expect(button("Revoke").props.disabled).toBe(true);
  await submit();
  await act(async () => button("Revoke").props.onClick());
  expect(createKey).toHaveBeenCalledTimes(1);
  expect(revokeKey).not.toHaveBeenCalled();
  expect(actions()).toEqual(["api_key_create_attempt"]);
  await act(async () => resolve({ apiKey: "SECRET_KEY_91" }));
});

test("failed operations still record attempts without error details", async () => {
  createKey.mockRejectedValueOnce(new Error("SECRET_ERROR_91"));
  revokeKey.mockRejectedValueOnce(new Error("SECRET_ERROR_91"));
  await mount(false);
  await act(async () =>
    renderer.root
      .findByType("input")
      .props.onChange({ target: { value: "SECRET_INPUT_91" } }),
  );
  await submit();
  await act(async () => button("Revoke").props.onClick());
  expect(actions()).toEqual([
    "api_key_create_attempt",
    "api_key_revoke_attempt",
  ]);
  expect(JSON.stringify(events)).not.toContain("SECRET_ERROR_91");
});

test("E2E and opt-out or expired leases suppress handler events", async () => {
  await mount(true);
  await act(async () => button("Revoke").props.onClick());
  expect(request).not.toHaveBeenCalled();
  expect(actions()).toEqual([]);
  await act(async () => renderer.unmount());
  renderer = undefined;
  await mount(false);
  const original = Date.now;
  try {
    Date.now = () => original() + 31000;
    await act(async () => button("Revoke").props.onClick());
  } finally {
    Date.now = original;
  }
  expect(actions()).toEqual([]);
  await act(async () =>
    renderer.root
      .findAllByType("button")
      .find((node) => node.children.includes("Allow analytics:"))
      .props.onClick(),
  );
  await act(async () => button("Revoke").props.onClick());
  expect(actions()).toEqual([]);
});
