import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { randomUUID } from "node:crypto";
import { backendUrl, siteUrl } from "../project";

test(
  "account deletion request survives reload and a fresh password session",
  { platforms: ["web"], timeout: 90_000 },
  async ({ app, screen, browser }) => {
    test.skip(
      process.env.E2E_ACCOUNT_DELETION !== "1",
      "Explicit local account deletion qualification only",
    );
    if (
      backendUrl() !== "http://127.0.0.1:3310" ||
      siteUrl() !== "http://127.0.0.1:3311" ||
      process.env.E2E_TELEMETRY_DISABLED !== "1"
    )
      throw new Error(
        "Deletion fixture requires the designated isolated backend and disabled telemetry.",
      );
    const username = `deletecheck${randomUUID().replaceAll("-", "")}`;
    const password = `Test-${randomUUID()}!`;
    const path = "/legal/delete-account";
    await app.open("/signup?returnTo=" + encodeURIComponent(path));
    await screen.getByLabel("Username", { exact: true }).fill(username);
    await screen.getByLabel("Password", { exact: true }).fill(password);
    await screen.getByLabel("Confirm password", { exact: true }).fill(password);
    await screen.getByRole("button", "Create account", { exact: true }).tap();
    const request = screen.getByRole("button", "Request account deletion", {
      exact: true,
    });
    await expect(request).toBeVisible();
    await request.tap();
    const confirm = screen.getByRole("button", "Confirm deletion request", {
      exact: true,
    });
    await expect(confirm).toBeDisabled();
    await screen.getByLabel("Confirmation", { exact: true }).fill("delete");
    await expect(confirm).toBeDisabled();
    await screen.getByRole("button", "Cancel", { exact: true }).tap();
    await request.tap();
    await screen.getByLabel("Confirmation", { exact: true }).fill("DELETE");
    await confirm.tap();
    const pending = screen
      .getByRole("status")
      .filter({ hasText: "Account deletion requested on" });
    await expect(pending).toBeVisible();
    await expect(pending).toContainText("deletion is not confirmed");
    const receipt = await pending.textContent();
    await browser.reload();
    await expect(pending).toHaveText(receipt!);
    await expect(request).not.toBeVisible();
    await app.screenshot("account-deletion-requested");
    await app.open("/dashboard");
    await screen.getByRole("button", "Logout", { exact: true }).tap();
    await expect(browser).toHaveURL("/");
    await app.open(path);
    await expect(
      screen.getByText("Sign in to manage your account deletion request."),
    ).toBeVisible();
    await app.open("/login?returnTo=" + encodeURIComponent(path));
    await screen.getByLabel("Username", { exact: true }).fill(username);
    await screen.getByLabel("Password", { exact: true }).fill(password);
    await screen.getByRole("button", "Log in", { exact: true }).tap();
    await expect(pending).toHaveText(receipt!);
    await expect(request).not.toBeVisible();
    await app.screenshot("account-deletion-restored");
  },
);
