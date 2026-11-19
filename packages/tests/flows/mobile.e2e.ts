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
    for (const tab of ["Guides", "Your apps"]) {
      await expect(
        screen
          .getByRole("tab", tab, { exact: true })
          .or(screen.getByRole("button", tab, { exact: true })),
      ).toBeVisible();
    }
  },
);

test(
  "iPhone Duo shows both Discover actions when unfolded",
  { platforms: ["ios"], timeout: 120_000 },
  async ({ app, screen, device }) => {
    test.skip(
      process.env.E2E_IOS_DUO !== "1",
      "Set E2E_IOS_DUO=1 with an iPhone Duo simulator",
    );
    await openMobile({ app, screen, device });
    const create = screen.getByRole("button", "Create app", { exact: true });
    const guides = screen.getByRole("button", "Explore guides", {
      exact: true,
    });

    try {
      await device.fold("closed");
      await expect(create).toBeVisible();

      await device.fold("open");
      await device.setOrientation("landscape-left");
      await expect
        .poll(async () => {
          const first = await create.boundingBox();
          const second = await guides.boundingBox();
          return Boolean(
            first &&
            second &&
            second.x >= first.x + first.width &&
            Math.abs(first.width - second.width) <= 1 &&
            second.x + second.width <= 951,
          );
        })
        .toBe(true);

      await guides.tap();
      await expect(create).not.toBeVisible();
      await expect(
        screen.getByText("Guides", { exact: true }).first(),
      ).toBeVisible();
    } finally {
      await device.fold("closed");
      await device.setOrientation("portrait");
    }
  },
);
