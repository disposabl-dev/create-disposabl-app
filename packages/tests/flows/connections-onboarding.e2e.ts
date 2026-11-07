import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { randomUUID } from "node:crypto";
import { backendUrl, project } from "../project.ts";

test(
  "login returns to connections and preserves the terminal setup URL",
  { platforms: ["web"], tags: ["connections"] },
  async ({ app, screen, browser }) => {
    test.skip(
      !project.features.includes("authentication"),
      "Authentication not selected",
    );
    // Creating a test user requires an explicitly selected isolated backend.
    const isolated = process.env.E2E_CONVEX_URL;
    test.skip(!isolated, "Set E2E_CONVEX_URL to an isolated preview backend");
    if (backendUrl().includes("vivid-caterpillar-633"))
      throw new Error("Never create test users in production");
    const response = await fetch(`${backendUrl()}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "auth:providers",
        args: {},
        format: "json",
      }),
    }).then((result) => result.json());
    if (response.status !== "success")
      throw new Error("Auth configuration unavailable");
    test.skip(
      response.value.emailPassword || response.value.googleOnly,
      "Username signup is unavailable",
    );
    const username = `connectioncheck${randomUUID().replaceAll("-", "")}`;
    const password = `Test-${randomUUID()}!`;
    await app.open("/signup");
    await screen.getByLabel("Username", { exact: true }).fill(username);
    await screen.getByLabel("Password", { exact: true }).fill(password);
    await screen.getByLabel("Confirm password", { exact: true }).fill(password);
    await screen.getByRole("button", "Create account", { exact: true }).tap();
    await expect(
      screen.getByRole("heading", "Connect your accounts."),
    ).toBeVisible();
    await expect(
      screen.getByRole("button", "Continue", { exact: true }),
    ).toBeDisabled();
    await screen.getByRole("button", "Logout", { exact: true }).tap();
    await expect(browser).toHaveURL("/");
    await app.open(
      "/dashboard/connections?origin=cli&mobile=1&features=analytics,payments",
    );
    await screen.getByLabel("Username", { exact: true }).fill(username);
    await screen.getByLabel("Password", { exact: true }).fill(password);
    await screen.getByRole("button", "Log in", { exact: true }).tap();
    await expect(
      screen.getByRole("heading", "Connect your accounts."),
    ).toBeVisible();
    await expect(
      screen.getByText("Step 3 · Required for mobile"),
    ).toBeVisible();
    await expect(screen.getByText(/Required.*analytics/i)).toBeVisible();
    await expect(
      screen.getByText("Required for payments", { exact: true }),
    ).toBeVisible();
    // A denied OAuth callback is safe to exercise without contacting a provider.
    await app.open(
      "/dashboard/connections?error=access_denied&code=discard&state=discard",
    );
    await expect(screen.getByRole("alert")).toContainText("cancelled");
    await expect(browser).toHaveURL("/dashboard/connections");
    await browser.reload();
    await expect(
      screen.getByText("Step 3 · Required for mobile"),
    ).toBeVisible();
    await expect(screen.getByText(/Required.*analytics/i)).toBeVisible();
    await expect(
      screen.getByText("Required for payments", { exact: true }),
    ).toBeVisible();
    if (process.env.E2E_CONNECTIONS_ENABLED === "1") {
      await screen.getByRole("button", "Connect Autumn", { exact: true }).tap();
      await screen
        .getByLabel("Sandbox secret key", { exact: true })
        .fill("invalid-test-input");
      await screen
        .getByRole("button", "Verify and save keys", { exact: true })
        .tap();
      await expect(screen.getByRole("alert")).toContainText(
        "Enter an Autumn sandbox secret key",
      );
      await screen.getByRole("button", "Cancel", { exact: true }).tap();
    }
    await screen.getByRole("button", "Logout", { exact: true }).tap();
  },
);
