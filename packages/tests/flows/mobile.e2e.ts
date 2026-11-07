import { openMobile } from "../helpers/mobile";
import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

test(
  "mobile home renders",
  { platforms: ["ios", "android"] },
  async ({ app, screen, device }) => {
    await openMobile({ app, device, screen });
    await expect(
      screen.getByRole("button", "Create app", { exact: true }),
    ).toBeVisible();
    await expect(
      screen.getByRole("tab", "Guides", { exact: true }),
    ).toBeVisible();
    await expect(
      screen.getByRole("tab", "Your apps", { exact: true }),
    ).toBeVisible();
  },
);
