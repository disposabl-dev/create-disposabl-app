import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";
import { openMobile } from "../helpers/mobile";

test(
  "Guides pauses when leaving playback and keeps guest actions available",
  { platforms: ["ios", "android"], timeout: 90_000 },
  async ({ app, device, screen }) => {
    test.skip(
      process.env.E2E_GUIDES_MEDIA !== "1",
      "Requires access to public Guides media",
    );
    await openMobile({ app, device, screen }, true);
    await screen.getByRole("button", "Explore guides", { exact: true }).tap();
    const welcome = screen.getByRole("button", "Watch Welcome to Disposabl", {
      exact: true,
    });
    await welcome.tap();

    const play = screen.getByRole("button", "Play video", { exact: true });
    const pause = screen.getByRole("button", "Pause video", { exact: true });
    await expect(pause).toBeVisible();
    await expect(
      screen.getByRole("button", "Share guide", { exact: true }),
    ).toBeVisible();
    await screen.getByRole("button", "Mute video", { exact: true }).tap();
    await expect(
      screen.getByRole("button", "Unmute video", { exact: true }),
    ).toBeVisible();
    await screen
      .getByRole("button", "Expand description for Welcome to Disposabl", {
        exact: true,
      })
      .tap();
    await expect(
      screen.getByRole(
        "button",
        "Collapse description for Welcome to Disposabl",
        { exact: true },
      ),
    ).toBeVisible();

    const foreground = await device.foregroundApp();
    await device.home();
    await device.openApp(foreground.bundleId ?? foreground.name);
    await expect(play).toBeVisible();
    await play.tap();
    await expect(pause).toBeVisible();
    await expect(
      screen.getByRole("button", "Sign in to like guide", { exact: true }),
    ).toBeVisible();
    await screen.getByRole("button", "Close guides", { exact: true }).tap();
    await expect(welcome).toBeVisible();
    await expect(pause).not.toBeVisible();
  },
);
