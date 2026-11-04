import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { backendUrl, project } from "../project.ts";

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
      await expect(screen.getByLabel("Password")).toBeVisible();
      await expect(screen.getByRole("button", "Log in")).toBeVisible();
      const response = await fetch(`${backendUrl()}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "auth:providers",
          args: {},
          format: "json",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      expect(response.status).toBe(200);
      const providers = await response.json();
      expect(providers.status).toBe("success");
      expect(typeof providers.value.google).toBe("boolean");
      await expect(
        screen.getByLabel(providers.value.emailPassword ? "Email" : "Username"),
      ).toBeVisible();
      await expect(
        screen.getByRole("button", "Sign in with Google"),
      ).toHaveCount(providers.value.google ? 1 : 0);
    } else {
      await expect(screen.getByRole("heading", "Dashboard")).toBeVisible();
    }
  },
);
