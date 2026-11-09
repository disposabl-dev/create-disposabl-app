import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const legalConfig = { appName: "Example", privacyEmail: "" };
mock.module("../../disposabl-kit/legal", () => ({ legalConfig }));
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options) => ({ options }),
}));
const { Route } =
  await import("../../disposabl-kit/client/routes/legal/support");
let renderer;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  legalConfig.privacyEmail = "";
});
test("support shows an honest unconfigured state", async () => {
  await act(async () => {
    renderer = create(createElement(Route.options.component));
  });
  expect(JSON.stringify(renderer.toJSON())).toContain(
    "publisher has not provided a support contact yet",
  );
});
test("support links to the configured contact", async () => {
  legalConfig.privacyEmail = "publisher@example.test";
  await act(async () => {
    renderer = create(createElement(Route.options.component));
  });
  expect(
    renderer.root
      .findAllByType("a")
      .some((a) => a.props.href === "mailto:publisher@example.test"),
  ).toBe(true);
});
