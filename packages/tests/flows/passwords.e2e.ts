import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { randomUUID } from "node:crypto";
import { backendUrl, project } from "../project.ts";

async function providers() {
  const response = await fetch(`${backendUrl()}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "auth:providers", args: {}, format: "json" }),
  });
  const result = await response.json();
  if (result.status !== "success")
    throw new Error("Auth configuration unavailable");
  return result.value as { emailPassword: boolean; emailDelivery: boolean };
}

test(
  "username account changes password and rejects the old password",
  { platforms: ["web"], tags: ["password"] },
  async ({ app, screen }) => {
    test.skip(
      !project.features.includes("authentication"),
      "Authentication not selected",
    );
    test.skip(
      (await providers()).emailPassword,
      "This flow requires the username fallback configuration",
    );
    // Only execute against the development/preview backend selected by the test runner.
    if (backendUrl().includes("vivid-caterpillar-633"))
      throw new Error("Never create test users in production");
    const username = `passwordcheck${randomUUID().replaceAll("-", "")}`;
    const password = `Initial-${randomUUID()}!`;
    const next = `Changed-${randomUUID()}!`;
    await app.open("/signup?returnTo=%2Fchange-password");
    await screen.getByLabel("Username", { exact: true }).fill(username);
    await screen.getByLabel("Password", { exact: true }).fill(password);
    await screen.getByLabel("Confirm password", { exact: true }).fill(password);
    await screen.getByRole("button", "Create account", { exact: true }).tap();
    await expect(
      screen.getByLabel("Current password", { exact: true }),
    ).toBeVisible();
    const otherSignIn = await fetch(`${backendUrl()}/api/mutation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "auth:signInWithUsernamePassword",
        args: { username, password },
        format: "json",
      }),
    }).then((response) => response.json());
    expect(otherSignIn.value?.status).toBe("complete");
    const otherRefreshToken = otherSignIn.value.tokens.refreshToken as string;
    await screen
      .getByLabel("Current password", { exact: true })
      .fill("Wrong-password-91!");
    await screen.getByLabel("New password", { exact: true }).fill(next);
    await screen
      .getByLabel("Confirm new password", { exact: true })
      .fill("mismatched");
    await screen.getByRole("button", "Change password", { exact: true }).tap();
    await expect(screen.getByRole("status")).toHaveText(
      "New passwords don't match.",
    );
    await screen.getByLabel("Confirm new password", { exact: true }).fill(next);
    await screen.getByRole("button", "Change password", { exact: true }).tap();
    await expect(screen.getByRole("status")).toHaveText(
      "Incorrect login or password.",
    );
    await screen.getByLabel("Current password", { exact: true }).fill(password);
    await screen.getByRole("button", "Change password", { exact: true }).tap();
    await expect(screen.getByRole("status")).toHaveText(
      "Your password has been changed.",
    );
    const revoked = await fetch(`${backendUrl()}/api/mutation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "auth:refreshSession",
        args: { refreshToken: otherRefreshToken },
        format: "json",
      }),
    }).then((response) => response.json());
    expect(revoked.value?.kind).toBe("noSession");
    await screen.getByRole("button", "Logout", { exact: true }).tap();
    await app.open("/login?returnTo=%2Fchange-password");
    await screen.getByLabel("Username", { exact: true }).fill(username);
    await screen.getByLabel("Password", { exact: true }).fill(password);
    await screen.getByRole("button", "Log in", { exact: true }).tap();
    await expect(screen.getByRole("alert")).toHaveText(
      "Incorrect login or password.",
    );
    await screen.getByLabel("Password", { exact: true }).fill(next);
    await screen.getByRole("button", "Log in", { exact: true }).tap();
    await expect(
      screen.getByLabel("Current password", { exact: true }),
    ).toBeVisible();
    await app.screenshot("password-change-verified");
    await screen.getByRole("button", "Logout", { exact: true }).tap();
  },
);

test(
  "password recovery states never pretend email is configured",
  { platforms: ["web"], tags: ["password"] },
  async ({ app, screen }) => {
    test.skip(
      !project.features.includes("authentication"),
      "Authentication not selected",
    );
    const config = await providers();
    await app.open("/forgot-password");
    if (config.emailDelivery)
      await expect(screen.getByRole("button", "Send reset link")).toBeVisible();
    else {
      await expect(
        screen.getByText(/Email recovery is not available/),
      ).toBeVisible();
      await expect(screen.getByRole("button", "Send reset link")).toHaveCount(
        0,
      );
    }
    await app.open("/reset-password?code=invalid");
    await expect(screen.getByRole("alert")).toContainText(
      "same browser or app",
    );
  },
);
