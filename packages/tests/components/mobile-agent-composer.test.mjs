import { expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
mock.module("nativewind", () => ({ VariableContextProvider: "Variable" }));
mock.module("react-native", () => ({
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
mock.module("../../../packages/disposabl-kit/mobile/design/nativewind", () => ({
  MenuView: "Menu",
}));
mock.module("../../../packages/disposabl-kit/mobile/design/use-theme", () => ({
  useTheme: () => ({}),
}));
mock.module(
  "../../../packages/disposabl-kit/mobile/components/use-dictation",
  () => ({
    useDictation: () => ({
      state: "idle",
      start: mock(),
      stop: mock(),
      cancel: mock(),
    }),
  }),
);
mock.module("../../../apps/mobile/src/features/studio/ui", () => ({
  GlassSurface: "GlassSurface",
  Icon: "Icon",
  feedback: mock(),
}));
const { MessageComposer } =
  await import("../../../apps/mobile/src/features/studio/message-composer");

test("one composer press invokes only its chosen send or stop handler", async () => {
  const onSend = mock(),
    onStop = mock();
  const props = {
    value: "draft",
    onChange: mock(),
    onSend,
    onStop,
    attachments: [],
    onPickAttachment: mock(),
    onRemoveAttachment: mock(),
    onRetryAttachment: mock(),
  };
  let renderer;
  await act(async () => {
    renderer = create(createElement(MessageComposer, props));
  });
  await act(async () =>
    renderer.root.findByProps({ testID: "create-app" }).props.onPress(),
  );
  expect(onSend).toHaveBeenCalledTimes(1);
  expect(onStop).not.toHaveBeenCalled();
  await act(async () =>
    renderer.update(
      createElement(MessageComposer, {
        ...props,
        value: "",
        stopAvailable: true,
      }),
    ),
  );
  await act(async () =>
    renderer.root.findByProps({ testID: "stop-agent" }).props.onPress(),
  );
  expect(onSend).toHaveBeenCalledTimes(1);
  expect(onStop).toHaveBeenCalledTimes(1);
  await act(async () => renderer.unmount());
});
