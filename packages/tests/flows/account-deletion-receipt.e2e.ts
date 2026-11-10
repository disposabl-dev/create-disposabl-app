import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { backendUrl, siteUrl } from "../project";
import { assertOwnedSdkBackend } from "../helpers/sdk-auth/ownership";
import { reserveSdkArtifacts } from "../helpers/sdk-auth/artifacts";

test(
  "saved request receipt survives synthetic authentication cleanup",
  { platforms: ["web"], requires: ["browser"], timeout: 90_000 },
  async ({ app, screen, browser }) => {
    test.skip(
      process.env.E2E_RECEIPT_CLEANUP !== "1",
      "Explicit isolated receipt qualification only",
    );
    const admin = process.env.E2E_CONVEX_ADMIN_KEY;
    const artifactPath = process.env.E2E_RECEIPT_ARTIFACT_DIR;
    const ports = [3530, 3310].find(
      (port) =>
        backendUrl() === `http://127.0.0.1:${port}` &&
        siteUrl() === `http://127.0.0.1:${port + 1}`,
    );
    if (
      ports === undefined ||
      process.env.E2E_TELEMETRY_DISABLED !== "1" ||
      !admin ||
      !artifactPath
    )
      throw new Error(
        "Receipt cleanup requires the dedicated loopback fixture and artifact directory.",
      );
    assertOwnedSdkBackend({
      markerVariable: "E2E_RECEIPT_OWNERSHIP_FILE",
      ports: [ports, ports + 1],
      claimDirectory: ".receipt-claimed",
    });
    const artifactDir = reserveSdkArtifacts(artifactPath);
    const call = async (
      path: string,
      args: object,
      kind: "function" | "query" = "function",
    ) => {
      const response = await fetch(`${backendUrl()}/api/${kind}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${admin}`,
        },
        body: JSON.stringify({ path, args, format: "json" }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json();
      if (result.status !== "success")
        throw new Error(`Local fixture call ${path} failed`);
      return result.value;
    };
    for (const name of [
      "E2E_TELEMETRY_DISABLED",
      "BOAT_API_KEY",
      "R2_ACCOUNT_ID",
      "R2_BUCKET_NAME",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "RESEND_API_KEY",
      "AUTH_GOOGLE_CLIENT_ID",
      "AUTH_GOOGLE_CLIENT_SECRET",
      "AUTUMN_SECRET_KEY",
      "POSTHOG_PROJECT_TOKEN",
      "POSTHOG_ENABLED",
      "DISPOSABL_ENVIRONMENT",
      "AUTH_GOOGLE_RELAY_SECRET",
      "REVENUECAT_WEBHOOK_AUTH",
      "GITHUB_CONNECTOR",
      "VERCEL_TOKEN",
      "CONVEX_OAUTH_CLIENT_SECRET",
      "CONNECTIONS_ENCRYPTION_KEY",
    ]) {
      const value = await call(
        "_system/cli/queryEnvironmentVariables:get",
        { name },
        "query",
      );
      const expected = name === "E2E_TELEMETRY_DISABLED" ? "1" : "";
      if ((value?.value?.trim() ?? "") !== expected)
        throw new Error(`Local receipt fixture isolation failed: ${name}`);
    }
    const username = `receipt${randomUUID().replaceAll("-", "")}`;
    const password = `Test-${randomUUID()}!`;
    const path = "/legal/delete-account";
    await app.open("/signup?returnTo=" + encodeURIComponent(path));
    await screen.getByLabel("Username", { exact: true }).fill(username);
    await screen.getByLabel("Password", { exact: true }).fill(password);
    await screen.getByLabel("Confirm password", { exact: true }).fill(password);
    await screen.getByRole("button", "Create account", { exact: true }).tap();
    await expect(
      screen.getByRole("button", "Request account deletion", { exact: true }),
    ).toBeVisible();
    await app.open("/dashboard");
    await screen.getByRole("button", "Logout", { exact: true }).tap();
    await expect(browser).toHaveURL("/");
    await app.open("/login?returnTo=" + encodeURIComponent(path));
    await screen.getByLabel("Username", { exact: true }).fill(username);
    await screen.getByLabel("Password", { exact: true }).fill(password);
    await screen.getByRole("button", "Log in", { exact: true }).tap();
    await screen
      .getByRole("button", "Request account deletion", { exact: true })
      .tap();
    await screen.getByLabel("Confirmation", { exact: true }).fill("DELETE");
    await screen
      .getByRole("button", "Confirm deletion request", { exact: true })
      .tap();
    const referenceText = screen.getByText(/Request reference:/);
    await expect(referenceText).toBeVisible();
    const reference = (await referenceText.textContent())!
      .replace("Request reference:", "")
      .trim();
    expect(reference).toMatch(/^[0-9a-f-]{36}$/);
    const receipt = await call("users/receipts:lookup", { reference });
    expect(receipt.reference).toBe(reference);
    const current = await call("users/internal:current", {
      userId: receipt.ownerId,
    });
    expect(current.username).toBe(username);
    await browser.reload();
    await expect(referenceText).toContainText(reference);
    const download = await browser.waitForDownload(() =>
      screen
        .getByRole("link", "Download request receipt", { exact: true })
        .tap(),
    );
    expect(download.suggestedFilename).toBe(
      `deletion-request-${reference}.txt`,
    );
    const bytes = await readFile(download.absolutePath);
    const text = bytes.toString("utf8");
    expect(text).toContain(`Reference: ${reference}`);
    expect(text).toContain(
      `Requested at: ${new Date(receipt.requestedAt).toISOString()}`,
    );
    expect(text).toContain("Publisher: Yast AI");
    expect(text).toContain("Support: vivek@yast.ai");
    expect(text.split("\n")).toContain("Status: requested");
    expect(text.split("\n")).toContain("Deletion is not confirmed.");
    const saved = join(artifactDir, "request-receipt.txt");
    await writeFile(saved, bytes);
    await app.screenshot("receipt-before-auth-cleanup");
    let progress;
    for (let i = 0; i < 10; i++) {
      progress = await call("users/authDeletion:runBatch", {
        userId: receipt.ownerId,
        expectedRequestedAt: receipt.requestedAt,
      });
      if (progress.state === "linked_auth_cleared") break;
    }
    expect(progress?.state).toBe("linked_auth_cleared");
    await browser.reload();
    await expect(
      screen.getByText("Sign in to manage your account deletion request."),
    ).toBeVisible();
    await app.open("/login?returnTo=" + encodeURIComponent(path));
    await screen.getByLabel("Username", { exact: true }).fill(username);
    await screen.getByLabel("Password", { exact: true }).fill(password);
    await screen.getByRole("button", "Log in", { exact: true }).tap();
    await expect(screen.getByRole("alert")).toBeVisible();
    await expect(screen.getByRole("alert")).toHaveText(
      "Incorrect login or password.",
    );
    expect((await readFile(saved)).equals(bytes)).toBe(true);
    expect(await call("users/receipts:lookup", { reference })).toEqual(receipt);
    await app.screenshot("receipt-after-auth-cleanup");
  },
);
