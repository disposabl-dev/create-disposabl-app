import { expect, mock, test } from "bun:test";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { getFunctionName } from "convex/server";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
let picker;
let upload;
let removed = [];
let controller;
let uploadCalls = 0;
mock.module("convex/react", () => ({
  useAction: (ref) =>
    getFunctionName(ref).endsWith(":upload")
      ? () => {
          uploadCalls++;
          return upload.promise;
        }
      : async ({ id }) => {
          removed.push(id);
        },
}));
mock.module("expo-document-picker", () => ({
  getDocumentAsync: () => picker.promise,
}));
mock.module("expo-image-picker", () => ({}));
mock.module("expo-file-system", () => ({
  File: class {
    size = 4;
    async arrayBuffer() {
      return new ArrayBuffer(4);
    }
  },
}));
mock.module("react-native", () => ({ Alert: { alert() {} } }));
const { useAttachments } =
  await import("../../../apps/mobile/src/features/studio/attachments");
function Probe() {
  controller = useAttachments();
  return null;
}
async function mount() {
  let renderer;
  await act(async () => {
    renderer = create(createElement(Probe));
  });
  return renderer;
}
const asset = {
  uri: "file:///draft",
  name: "draft.txt",
  mimeType: "text/plain",
};

test("leaving during the picker does not start an upload", async () => {
  picker = deferred();
  upload = deferred();
  removed = [];
  uploadCalls = 0;
  const renderer = await mount();
  let work;
  await act(async () => {
    work = controller.pick("files");
  });
  await act(async () => renderer.unmount());
  await act(async () => {
    picker.resolve({ canceled: false, assets: [asset] });
    await work;
  });
  expect(removed).toEqual([]);
  expect(uploadCalls).toBe(0);
  expect(controller.attachments).toEqual([]);
});

test("an upload finishing after unmount is removed", async () => {
  picker = deferred();
  upload = deferred();
  removed = [];
  uploadCalls = 0;
  const renderer = await mount();
  let work;
  await act(async () => {
    work = controller.pick("files");
    picker.resolve({ canceled: false, assets: [asset] });
    await Promise.resolve();
  });
  expect(uploadCalls).toBe(1);
  await act(async () => renderer.unmount());
  await act(async () => {
    upload.resolve("late-file");
    await work;
  });
  expect(removed).toEqual(["late-file"]);
});

test("unmount preserves an in-flight send, even if it later succeeds", async () => {
  picker = deferred();
  upload = deferred();
  removed = [];
  const renderer = await mount();
  await act(async () => {
    const work = controller.pick("files");
    picker.resolve({ canceled: false, assets: [asset] });
    upload.resolve("sent-file");
    await work;
  });
  expect(controller.attachments[0].id).toBe("sent-file");
  expect(controller.beginSend(["sent-file"])).toBe(true);
  await act(async () => renderer.unmount());
  controller.markSent(["sent-file"]);
  expect(removed).toEqual([]);
});

test("unmount discards unsent uploaded files and preserves uncertain sends", async () => {
  picker = deferred();
  upload = deferred();
  removed = [];
  const renderer = await mount();
  await act(async () => {
    const work = controller.pick("files");
    picker.resolve({ canceled: false, assets: [asset] });
    upload.resolve("unsent");
    await work;
  });
  await act(async () => renderer.unmount());
  expect(removed).toEqual(["unsent"]);
  picker = deferred();
  upload = deferred();
  removed = [];
  const second = await mount();
  await act(async () => {
    const work = controller.pick("files");
    picker.resolve({ canceled: false, assets: [asset] });
    upload.resolve("uncertain");
    await work;
  });
  expect(controller.beginSend(["uncertain"])).toBe(true);
  await act(async () => second.unmount());
  controller.sendFailed(["uncertain"]);
  expect(removed).toEqual([]);
  picker = deferred();
  upload = deferred();
  removed = [];
  const third = await mount();
  await act(async () => {
    const work = controller.pick("files");
    picker.resolve({ canceled: false, assets: [asset] });
    upload.resolve("rejected");
    await work;
  });
  expect(controller.beginSend(["rejected"])).toBe(true);
  await act(async () => third.unmount());
  controller.sendFailed(["rejected"], true);
  expect(removed).toEqual(["rejected"]);
});

test("uncertain send while mounted stays preserved after later unmount", async () => {
  picker = deferred();
  upload = deferred();
  removed = [];
  const renderer = await mount();
  await act(async () => {
    const work = controller.pick("files");
    picker.resolve({ canceled: false, assets: [asset] });
    upload.resolve("uncertain-mounted");
    await work;
  });
  expect(controller.beginSend(["uncertain-mounted"])).toBe(true);
  controller.sendFailed(["uncertain-mounted"]);
  await act(async () => renderer.unmount());
  expect(removed).toEqual([]);
});
