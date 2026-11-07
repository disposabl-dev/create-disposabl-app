import type { Device } from "@e2e-dev/mobile";
import { expect, type TestFixtures } from "e2e";

/** Pin development builds when several Metro servers are running. Release builds need no URL. */
export async function openMobile(
  {
    app,
    device,
    screen,
  }: Pick<TestFixtures, "app" | "screen"> & { device: Device },
  restart = false,
) {
  if (restart) await app.restart();
  else await app.open();
  const origin = process.env.E2E_MOBILE_DEV_URL;
  if (origin) {
    const scheme = process.env.E2E_MOBILE_DEV_SCHEME;
    if (!scheme || !/^[a-z][a-z0-9+.-]*$/i.test(scheme))
      throw new Error(
        "Set E2E_MOBILE_DEV_SCHEME to the installed development client's unique URL scheme.",
      );
    const url = new URL(`${scheme}://expo-development-client/`);
    url.searchParams.set("url", origin);
    url.searchParams.set("__expo_disable_fab", "1");
    url.searchParams.set("__expo_disable_onboarding", "1");
    await device.openLink(url.href);
  }
  const settings = screen.getByRole("button", "Settings", { exact: true });
  await expect(settings).toHaveCount(1, { timeout: 30_000 });
  await expect(settings).toBeVisible({ timeout: 30_000 });
}
