import { openMobile } from "../helpers/mobile";
import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";
import { project } from "../project";

test(
  "disabled authentication blocks the retained password link",
  { platforms: ["ios", "android"] },
  async ({ app, device, screen }) => {
    test.skip(
      project.features.includes("authentication"),
      "Requires authentication disabled",
    );
    await openMobile({ app, device, screen });
    await device.openLink(
      `${process.env.E2E_MOBILE_SCHEME || "mobile"}://change-password`,
    );
    await expect(
      screen.getByRole("button", "Settings", { exact: true }),
    ).toBeVisible();
    await expect(
      screen.getByText("Change password", { exact: true }),
    ).not.toBeVisible();
    await screen.getByRole("button", "Settings", { exact: true }).tap();
    await expect(screen.getByRole("button", /Appearance:/)).toBeVisible();
    await expect(
      screen.getByRole("button", "Sign in", { exact: true }),
    ).not.toBeVisible();
    await expect(
      screen.getByText("Change password", { exact: true }),
    ).not.toBeVisible();
  },
);
