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

test(
  "connected accounts continue to the composer and CLI setup stays on its completion page",
  { platforms: ["web"], tags: ["connections"] },
  async ({ app, screen, browser }) => {
    const origin = new URL(backendUrl());
    test.skip(
      !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
        origin.port !== "3310",
      "Provider fixtures require the isolated loopback backend",
    );
    const key = process.env.E2E_CONVEX_ADMIN_KEY;
    test.skip(!key, "E2E_CONVEX_ADMIN_KEY is required for isolated fixtures");
    const { handoffFixture } = await import("../helpers/browser-handoff.ts");
    const fixture = await handoffFixture();
    async function seed(path: string, args: object) {
      const result = await fetch(`${origin.origin}/api/mutation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${key}`,
        },
        body: JSON.stringify({ path, args, format: "json" }),
      }).then((response) => response.json());
      if (result.status !== "success")
        throw new Error(`Local fixture failed: ${path}`);
    }
    await app.open(fixture.path);
    await screen
      .getByRole("button", `Continue as @${fixture.username}`, { exact: true })
      .tap();
    await expect(
      screen.getByRole("heading", "Connect your accounts."),
    ).toBeVisible();
    await app.open("/dashboard?origin=web");
    await expect(
      screen.getByRole("heading", "Connect your accounts."),
    ).toBeVisible();
    await expect(
      screen.getByRole("button", "Continue", { exact: true }),
    ).toBeDisabled();
    await seed("github/internal:connect", {
      userId: fixture.userId,
      owner: "fixture",
      installationId: "12345",
    });
    await seed("connections/internal:save", {
      userId: fixture.userId,
      provider: "convex",
      accountId: "fixture",
      name: "Fixture",
      token: "fixture",
    });
    await expect(
      screen.getByRole("button", "Continue", { exact: true }),
    ).toBeVisible();
    await screen.getByRole("button", "Continue", { exact: true }).tap();
    await expect(screen.getByTestId("agent-onboarding")).toBeVisible();

    await app.open("/dashboard/connections?origin=cli");
    await expect(
      screen.getByRole("link", "Go to dashboard", { exact: true }),
    ).toBeVisible();
    await app.open(
      "/dashboard/connections?error=access_denied&code=discard&state=discard",
    );
    await expect(screen.getByRole("alert")).toContainText("cancelled");
    await expect(browser).toHaveURL("/dashboard/connections");
    await browser.reload();
    await expect(
      screen.getByRole("link", "Go to dashboard", { exact: true }),
    ).toBeVisible();
    await expect(screen.getByTestId("agent-onboarding")).not.toBeVisible();
  },
);
