import type { Device } from "@e2e-dev/mobile";

/** One explicit diagnostic on a locally owned simulator; normal queries stay unchanged. */
export async function dismissObservedSavePassword(
  device: Pick<Device, "unstable_raw">,
) {
  const { platform, deviceId, client, selection } = device.unstable_raw;
  if (
    platform !== "ios" ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(deviceId)
  )
    throw new Error("Save Password diagnostic requires an iOS simulator.");
  const observed = await client.command.alert({
    ...selection,
    action: "get",
    timeoutMs: 5_000,
  });
  const buttons = observed.items;
  if (
    observed.message !== "Save Password?" ||
    !Array.isArray(buttons) ||
    buttons.length !== 2 ||
    buttons.filter((button) => button === "Not Now").length !== 1 ||
    buttons.filter((button) => button === "Save").length !== 1
  )
    throw new Error("Unexpected alert; Save Password diagnostic stopped.");
  await client.command.alert({
    ...selection,
    action: "dismiss",
    timeoutMs: 5_000,
  });
}
