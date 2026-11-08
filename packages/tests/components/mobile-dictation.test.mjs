import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const events = new Map();
const emit = (event, payload) =>
  [...(events.get(event) || [])].forEach((fn) => fn(payload));
const speech = {
  addListener(event, fn) {
    const set = events.get(event) || new Set();
    events.set(event, set);
    set.add(fn);
    return { remove: () => set.delete(fn) };
  },
  isRecognitionAvailable: () => true,
  requestPermissionsAsync: mock(async () => ({ granted: true })),
  start: mock(() => {}),
  stop: mock(() => {}),
  abort: mock(() => {}),
};
const appState = {
  currentState: "active",
  addEventListener: (name, fn) => speech.addListener("appstate", fn),
};
mock.module("react-native", () => ({ AppState: appState }));
const navigation = {
  addListener: (event, fn) => speech.addListener(event, fn).remove,
};
mock.module("expo-router", () => ({ useNavigation: () => navigation }));
mock.module("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: speech,
}));
const { useDictation } =
  await import("../../disposabl-kit/mobile/components/use-dictation");
let controller, renderer, value, sent;
function Probe() {
  controller = useDictation({
    value,
    onChange: (text) => {
      value = text;
    },
    onSend: (text) => sent.push(text),
  });
  return null;
}
const mount = async () =>
  act(async () => {
    renderer = create(createElement(Probe));
  });
beforeEach(async () => {
  value = "Existing";
  sent = [];
  speech.start.mockClear();
  speech.stop.mockClear();
  speech.abort.mockClear();
  speech.requestPermissionsAsync.mockImplementation(async () => ({
    granted: true,
  }));
  await mount();
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  emit("end");
});
test("Send waits for final transcription; interim replacements do not duplicate words", async () => {
  await act(async () => {
    await controller.start();
    emit("start");
  });
  await act(async () => emit("result", { results: [{ transcript: "one" }] }));
  await act(async () => controller.send());
  expect(sent).toEqual([]);
  await act(async () => {
    emit("result", { results: [{ transcript: "one two" }] });
    emit("end");
  });
  expect(sent).toEqual(["Existing one two"]);
});
test("Cancel aborts native start even before start event and restores original draft", async () => {
  await act(async () => controller.start());
  await act(async () => controller.cancel());
  expect(speech.abort).toHaveBeenCalledTimes(1);
  await act(async () => {
    emit("result", { results: [{ transcript: "late" }] });
    emit("end");
  });
  expect(value).toBe("Existing");
  expect(sent).toEqual([]);
});
test("Unmount holds native ownership until old abort completes", async () => {
  await act(async () => controller.start());
  await act(async () => renderer.unmount());
  await mount();
  await act(async () => controller.start());
  expect(speech.start).toHaveBeenCalledTimes(1);
  await act(async () => emit("end"));
  await act(async () => controller.start());
  expect(speech.start).toHaveBeenCalledTimes(2);
});
test("A permission result after cancellation cannot start recording", async () => {
  let resolve;
  speech.requestPermissionsAsync.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  let pending;
  await act(async () => {
    pending = controller.start();
  });
  await act(async () => controller.cancel());
  await act(async () => {
    resolve({ granted: true });
    await pending;
  });
  expect(speech.start).not.toHaveBeenCalled();
});
test("An interruption never sends the draft", async () => {
  await act(async () => {
    await controller.start();
    emit("start");
  });
  await act(async () => {
    controller.send();
    emit("appstate", "background");
    emit("result", { results: [{ transcript: "late" }] });
    emit("end");
  });
  expect(speech.abort).toHaveBeenCalled();
  expect(sent).toEqual([]);
});
