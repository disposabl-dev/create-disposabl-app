import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "shared agent block preserves prompt and CLI choices",
  { platforms: ["web"] },
  async ({ app, screen, browser }) => {
    await app.open("/");
    await browser.locator("#start").tap();
    await expect(
      browser.locator('[data-testid="agent-onboarding"]'),
    ).toHaveCount(1);
    await expect(
      screen.getByRole("group", "Coding agents and assistants"),
    ).toBeVisible();
    await expect(browser.locator(".agent-logo img")).toHaveCount(8);
    await screen.getByRole("button", "Copy prompt").tap();
    await expect(screen.getByRole("status")).toHaveText("Copied to clipboard.");
    await screen.getByRole("button", "Run a command").tap();
    await expect(
      screen.getByText(
        "bunx create-disposabl-app@latest --platforms web,android,ios",
      ),
    ).toBeVisible();
    await screen.getByRole("button", "npm", { exact: true }).tap();
    await expect(
      screen.getByText(
        "npx create-disposabl-app@latest --platforms web,android,ios",
      ),
    ).toBeVisible();
    await screen.getByRole("button", "Copy command").tap();
    await expect(screen.getByRole("status")).toHaveText("Copied to clipboard.");
  },
);
