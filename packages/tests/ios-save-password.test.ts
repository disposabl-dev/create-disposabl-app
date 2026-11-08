import { test } from "node:test";
import assert from "node:assert/strict";
import { dismissObservedSavePassword } from "./helpers/ios-save-password";

function fixture(
  result: unknown,
  platform = "ios",
  deviceId = "2777975C-AA8B-42A3-8C1F-B01C7C21F42B",
) {
  const calls: { action: string }[] = [];
  const device = {
    unstable_raw: {
      platform,
      deviceId,
      selection: { deviceId },
      client: {
        command: {
          alert: async (options: { action: string }) => {
            calls.push(options);
            if (result instanceof Error) throw result;
            return result;
          },
        },
      },
    },
  } as never;
  return { device, calls };
}

test("diagnostic dismisses only an exactly identified Save Password prompt", async () => {
  const known = fixture({
    message: "Save Password?",
    items: ["Not Now", "Save"],
  });
  await dismissObservedSavePassword(known.device);
  assert.deepEqual(
    known.calls.map((call) => call.action),
    ["get", "dismiss"],
  );
  for (const value of [
    { message: "Save Password?", items: ["Not Now"] },
    { message: "Save Password?", items: ["Cancel", "Not Now", "Save"] },
    { message: "Other?", items: ["Not Now", "Save"] },
    { message: "Save Password?", items: ["Not Now", "Not Now"] },
    new Error("alert not found"),
  ]) {
    const unknown = fixture(value);
    await assert.rejects(dismissObservedSavePassword(unknown.device));
    assert.deepEqual(
      unknown.calls.map((call) => call.action),
      ["get"],
    );
  }
  const android = fixture({}, "android");
  await assert.rejects(
    dismissObservedSavePassword(android.device),
    /iOS simulator/,
  );
  assert.deepEqual(android.calls, []);
});
