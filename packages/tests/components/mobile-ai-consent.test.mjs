import { afterEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let allowed = false;
let renderer;
const alert = mock();
const set = mock(async () => {});
const send = mock();
mock.module("react-native", () => ({ Alert: { alert } }));
mock.module("convex/react", () => ({
  useQuery: () => allowed,
  useMutation: () => set,
}));
mock.module("../../disposabl-kit/mobile/design/preferences", () => ({
  PreferenceRow: "Row",
}));
const { AiConsentPreference, useAiConsent } =
  await import("../../../apps/mobile/src/features/management/ai-safety");

function Fixture({ isActive }) {
  const { confirm } = useAiConsent();
  return createElement(
    "Button",
    {
      onPress: async () => {
        if (await confirm(isActive)) send();
      },
    },
    createElement(AiConsentPreference),
  );
}

async function mount(isActive = () => true) {
  await act(async () => {
    renderer = create(createElement(Fixture, { isActive }));
  });
}

afterEach(async () => {
  await act(async () => renderer?.unmount());
  allowed = false;
  alert.mockClear();
  set.mockClear();
  send.mockClear();
});

test("first send waits for consent and continues from Allow and send", async () => {
  await mount();
  expect(renderer.root.findAllByType("Row")).toHaveLength(0);
  const pending = renderer.root.findByType("Button").props.onPress();
  expect(send).not.toHaveBeenCalled();
  alert.mock.calls[0][2]
    .find((button) => button.text === "Allow and send")
    .onPress();
  await pending;
  expect(set).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledTimes(1);
});

test("dismissing consent or changing sessions cannot send", async () => {
  let active = true;
  await mount(() => active);
  const press = renderer.root.findByType("Button").props.onPress;
  const dismissed = press();
  alert.mock.calls[0][3].onDismiss();
  await dismissed;
  const switched = press();
  active = false;
  alert.mock.calls[1][2][1].onPress();
  await switched;
  expect(set).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

test("accounts with permission send immediately and can revoke it", async () => {
  allowed = true;
  await mount();
  await renderer.root.findByType("Button").props.onPress();
  expect(alert).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByType("Row").props.label).toBe("Revoke AI sharing");
});
