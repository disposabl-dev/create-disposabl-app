import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

function assertOwnedBackend() {
  const path = process.env.E2E_CHECKOUT_OWNERSHIP_FILE ?? "";
  const marker = realpathSync(path);
  if (
    !marker.startsWith(`${realpathSync("/tmp")}/disposabl-checkout-browser-`) ||
    !marker.endsWith("/ownership.json")
  )
    throw new Error("Invalid fixture ownership");
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    stat.mode & 0o077
  )
    throw new Error("Invalid fixture marker");
  const lease = JSON.parse(readFileSync(marker, "utf8"));
  const parent = (pid: number) => {
    const output = execFileSync(
      "lsof",
      ["-nP", "-a", "-p", String(pid), "-FpR"],
      { encoding: "utf8" },
    );
    const line = output.split("\n").find((item) => /^R\d+$/.test(item));
    if (!line) throw new Error("Missing process ancestry");
    return Number(line.slice(1));
  };
  let pid = process.pid;
  const seen = new Set<number>();
  while (pid > 1 && pid !== lease.launcherPid) {
    if (seen.has(pid)) throw new Error("Invalid process ancestry");
    seen.add(pid);
    pid = parent(pid);
  }
  if (
    pid !== lease.launcherPid ||
    parent(lease.backendPid) !== lease.launcherPid
  )
    throw new Error("Unowned backend");
  const executable = realpathSync(lease.executable);
  if (!executable.endsWith("/convex-local-backend"))
    throw new Error("Unexpected backend binary");
  const binary = execFileSync(
    "lsof",
    ["-a", "-p", String(lease.backendPid), "-Fn", "--", executable],
    { encoding: "utf8" },
  );
  if (!binary.split("\n").includes(`n${executable}`))
    throw new Error("Unexpected backend process");
  const db = realpathSync(lease.database);
  if (
    !db.startsWith(`${dirname(marker)}/`) ||
    lstatSync(db).birthtimeMs < stat.birthtimeMs
  )
    throw new Error("Unowned database");
  for (const port of [3540, 3541]) {
    const value = execFileSync(
      "lsof",
      [
        "-nP",
        "-a",
        "-p",
        String(lease.backendPid),
        `-iTCP:${port}`,
        "-sTCP:LISTEN",
        "-Fn",
      ],
      { encoding: "utf8" },
    );
    if (
      value
        .split("\n")
        .filter((line) => line.startsWith("n"))
        .join() !== `n127.0.0.1:${port}`
    )
      throw new Error("Unowned listener");
  }
  const opened = execFileSync(
    "lsof",
    ["-a", "-p", String(lease.backendPid), "-Fn", "--", db],
    { encoding: "utf8" },
  );
  if (!opened.split("\n").includes(`n${db}`))
    throw new Error("Database not owned by backend");
  // A runner must not repeat account creation on a previously used database.
  mkdirSync(join(dirname(marker), ".claimed"));
}

test(
  "authenticated pricing dispatches a local test checkout once",
  { platforms: ["web"] },
  async ({ app, browser, screen }) => {
    test.skip(
      process.env.E2E_CHECKOUT_BROWSER !== "1",
      "Requires isolated checkout fixture",
    );
    if (
      process.env.E2E_CONVEX_URL !== "http://127.0.0.1:3540" ||
      process.env.E2E_CONVEX_SITE_URL !== "http://127.0.0.1:3541" ||
      process.env.E2E_TELEMETRY_DISABLED !== "1"
    )
      throw new Error("Unsafe checkout fixture environment");
    assertOwnedBackend();
    const adminKey = process.env.E2E_CONVEX_ADMIN_KEY;
    if (!adminKey) throw new Error("Missing local admin key");
    for (const name of [
      "E2E_TELEMETRY_DISABLED",
      "BOAT_API_KEY",
      "AUTUMN_SECRET_KEY",
      "REVENUECAT_WEBHOOK_AUTH",
      "R2_ACCOUNT_ID",
      "R2_BUCKET_NAME",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "RESEND_API_KEY",
      "POSTHOG_PROJECT_TOKEN",
    ]) {
      const result = await fetch("http://127.0.0.1:3540/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Convex ${adminKey}`,
        },
        body: JSON.stringify({
          path: "_system/cli/queryEnvironmentVariables:get",
          args: { name },
          format: "json",
        }),
      }).then((r) => r.json());
      if (
        result.status !== "success" ||
        (result.value?.value?.trim() ?? "") !==
          (name === "E2E_TELEMETRY_DISABLED" ? "1" : "")
      )
        throw new Error("Unsafe backend configuration");
    }
    const username = `checkout${randomUUID().replaceAll("-", "")}`;
    const password = `Fixture-${randomUUID()}!`;
    await app.open("/signup?returnTo=%2Fpricing");
    await screen.getByLabel("Username").fill(username);
    await screen.getByLabel("Password", { exact: true }).fill(password);
    await screen.getByLabel("Confirm password").fill(password);
    await screen.getByRole("button", "Create account").tap();
    await expect(screen.getByRole("heading", "Pricing")).toBeVisible();
    await expect(
      screen.getByText("Available credits: 42", { exact: false }),
    ).toBeVisible();
    await expect(screen.getByText(username, { exact: true })).toBeVisible();
    await browser.evaluate(() => {
      Array.from(document.querySelectorAll("strong"))
        .find((element) =>
          element.parentElement?.textContent?.startsWith("Signed in as"),
        )
        ?.scrollIntoView({ block: "center" });
      return null;
    });
    await app.screenshot("pricing-before-checkout");
    const evidence = async () =>
      browser.evaluate(async () => {
        const key = `__convexAuthJWT_${"http://127.0.0.1:3540".replace(/[^a-zA-Z0-9]/g, "")}`;
        const token = localStorage.getItem(key);
        if (!token) throw new Error("Missing browser session");
        const response = await fetch("http://127.0.0.1:3540/api/query", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            path: "fixtureBillingCheckout:evidence",
            args: {},
            format: "json",
          }),
        });
        const result = await response.json();
        if (result.status !== "success")
          throw new Error("Evidence query failed");
        const account = await fetch("http://127.0.0.1:3540/api/query", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            path: "users/index:current",
            args: {},
            format: "json",
          }),
        }).then((r) => r.json());
        if (account.status !== "success")
          throw new Error("Account query failed");
        return { ...result.value, username: account.value?.username };
      });
    await screen.getByRole("button", "Choose monthly").tap();
    await expect(
      screen.getByRole("heading", "Local test checkout"),
    ).toBeVisible();
    await app.screenshot("local-test-checkout");
    await app.open("/pricing");
    await expect(screen.getByText(username, { exact: true })).toBeVisible();
    const first = await evidence();
    expect(first.username).toBe(username);
    expect(first.calls).toHaveLength(1);
    expect(first.calls[0].planId).toBe("credits_monthly");
    expect(first.calls[0].userId).toBe(first.userId);
    expect(first.attempts).toHaveLength(1);
    expect(first.attempts[0].userId).toBe(first.userId);
    expect(first.attempts[0].purchase).toBe("monthly");
    expect(first.attempts[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.attempts[0].url).toBe(
      "http://127.0.0.1:3549/local-test-checkout",
    );
    await expect(
      screen.getByText("Available credits: 42", { exact: false }),
    ).toBeVisible();
    await screen.getByRole("button", "Choose monthly").tap();
    await expect(
      screen.getByRole("heading", "Local test checkout"),
    ).toBeVisible();
    await app.open("/pricing");
    await expect(screen.getByText(username, { exact: true })).toBeVisible();
    const again = await evidence();
    expect(again.calls).toHaveLength(1);
    expect(again.attempts).toHaveLength(1);
    await expect(
      screen.getByText("Available credits: 42", { exact: false }),
    ).toBeVisible();
    await screen.getByRole("button", "Buy top-up").tap();
    await expect(
      screen.getByRole("heading", "Local test checkout"),
    ).toBeVisible();
    await app.screenshot("topup-local-test-checkout");
    await app.open("/pricing");
    await expect(screen.getByText(username, { exact: true })).toBeVisible();
    const topup = await evidence();
    expect(topup.calls).toHaveLength(2);
    const topupCall = topup.calls.find(
      (call: { planId: string }) => call.planId === "credits_topup",
    );
    expect(topupCall.userId).toBe(topup.userId);
    expect(topupCall.feature).toBe("credits");
    expect(topupCall.quantity).toBe(500);
    const topupAttempt = topup.attempts.find(
      (attempt: { purchase: string }) => attempt.purchase === "topup",
    );
    expect(topupAttempt.userId).toBe(topup.userId);
    expect(topupAttempt.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(topupAttempt.url).toBe("http://127.0.0.1:3549/local-test-checkout");
  },
);
