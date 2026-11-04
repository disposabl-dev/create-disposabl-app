import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { project } from "../project.ts";

test(
  "public home renders",
  { platforms: ["web"] },
  async ({ app, browser }) => {
    await app.open("/");
    await expect(browser.locator("main h1")).toBeVisible();
  },
);

test(
  "dashboard respects the authentication feature",
  { platforms: ["web"] },
  async ({ app, screen }) => {
    await app.open("/dashboard");
    if (project.features.includes("authentication")) {
      await expect(screen.getByLabel("Username")).toBeVisible();
      await expect(screen.getByLabel("Password")).toBeVisible();
      await expect(screen.getByRole("button", "Log in")).toBeVisible();
    } else {
      await expect(screen.getByRole("heading", "Dashboard")).toBeVisible();
    }
  },
);
