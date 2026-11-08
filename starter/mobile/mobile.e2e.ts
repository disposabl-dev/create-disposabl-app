import { openMobile } from "../helpers/mobile";
import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";
import { docsEnabled } from "../../disposabl-kit/features";

test(
  "mobile home renders",
  { platforms: ["ios", "android"] },
  async ({ app, screen, device }) => {
    await openMobile({ app, device, screen });
    await expect(screen.getByText("Your app starts here.")).toBeVisible();
    const docs = screen.getByRole("button", "Docs", { exact: true });
    if (docsEnabled) await expect(docs).toBeVisible();
    else await expect(docs).not.toBeVisible();
  },
);
