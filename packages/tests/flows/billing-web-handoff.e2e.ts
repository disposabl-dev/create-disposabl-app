import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const api = "http://127.0.0.1:3451";
const code = "Q".repeat(43);
async function reset(purchase: "monthly" | "topup", overrides: object = {}) {
  const res = await fetch(`${api}/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code,
      user: "alice",
      purchase,
      expiresAt: Date.now() + 120_000,
      balance: 0,
      monthly: false,
      mode: "url",
      ...overrides,
    }),
  });
  if (!res.ok) throw new Error("Fixture reset failed");
}
async function update(value: object) {
  const res = await fetch(`${api}/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error("Fixture update failed");
}
async function attempts() {
  return (await (await fetch(`${api}/state`)).json()).attempts as {
    user: string;
    purchase: string;
    requestId: string;
  }[];
}

test(
  "monthly handoff requires consent, preserves selection and resumes checkout",
  { platforms: ["web"] },
  async ({ app, screen, browser }) => {
    test.skip(
      process.env.E2E_BILLING_WEB_FIXTURE !== "1",
      "Requires isolated billing browser fixture on ports 3450/3451",
    );
    await reset("monthly");
    await app.open(`/billing-login#${code}`);
    await expect(browser).toHaveURL("/billing-login");
    await expect(
      screen.getByRole("button", "Continue as @alice"),
    ).toBeVisible();
    expect((await attempts()).length).toBe(0);
    await app.screenshot("monthly-consent");
    await screen.getByRole("button", "Continue as @alice").tap();
    await expect(
      screen.getByText(
        "750 credits each month. Unused monthly credits expire.",
      ),
    ).toBeVisible();
    await expect(screen.getByText("$5 / month")).toBeVisible();
    await expect(screen.getByRole("button", "Buy top-up")).toHaveCount(0);
    await screen.getByRole("button", "Choose monthly").tap();
    await expect(screen.getByRole("heading", "Fixture checkout")).toBeVisible();
    await app.screenshot("monthly-fixture-checkout");
    await screen.getByRole("link", "Return to pricing").tap();
    await expect(screen.getByRole("button", "Choose monthly")).toBeVisible();
    await screen.getByRole("button", "Choose monthly").tap();
    await expect(screen.getByRole("heading", "Fixture checkout")).toBeVisible();
    const calls = await attempts();
    expect(calls.length).toBe(2);
    expect(
      calls.every((x) => x.user === "alice" && x.purchase === "monthly"),
    ).toBe(true);
    await app.open(`/billing-login#${code}`);
    await expect(screen.getByRole("alert")).toContainText("expired");
  },
);

test(
  "top-up handoff survives monthly ownership and refreshes only fixture balance",
  { platforms: ["web"] },
  async ({ app, screen }) => {
    test.skip(
      process.env.E2E_BILLING_WEB_FIXTURE !== "1",
      "Requires isolated billing browser fixture on ports 3450/3451",
    );
    await reset("topup", { monthly: true, balance: 9 });
    await app.open(`/billing-login#${code}`);
    await screen.getByRole("button", "Continue as @alice").tap();
    await expect(
      screen.getByText("500 credits that do not expire."),
    ).toBeVisible();
    await expect(screen.getByText("$5 once")).toBeVisible();
    await expect(screen.getByRole("button", "Choose monthly")).toHaveCount(0);
    await expect(
      screen.getByText("Available credits: 9", { exact: false }),
    ).toBeVisible();
    await app.screenshot("topup-before-checkout");
    await screen.getByRole("button", "Buy top-up").tap();
    await expect(screen.getByRole("heading", "Fixture checkout")).toBeVisible();
    await screen.getByRole("link", "Return to pricing").tap();
    await expect(
      screen.getByText("Available credits: 9", { exact: false }),
    ).toBeVisible();
    await update({ balance: 10 });
    await screen.getByRole("button", "Refresh", { exact: true }).tap();
    await expect(
      screen.getByText("Available credits: 10", { exact: false }),
    ).toBeVisible();
    await app.screenshot("topup-refreshed");
    expect((await attempts())[0]?.purchase).toBe("topup");
  },
);

test(
  "unknown attempt keeps identity until reconciled and explicit retry",
  { platforms: ["web"] },
  async ({ app, screen }) => {
    test.skip(
      process.env.E2E_BILLING_WEB_FIXTURE !== "1",
      "Requires isolated billing browser fixture on ports 3450/3451",
    );
    await reset("topup", {
      mode: "unknown",
      returnChannel: "preview",
      returnExpiresAt: Date.now() + 300_000,
    });
    await app.open(`/billing-login#${code}`);
    await screen.getByRole("button", "Continue as @alice").tap();
    await screen.getByRole("button", "Buy top-up").tap();
    await expect(screen.getByRole("status")).toContainText(
      "Checkout status could not be confirmed",
    );
    await expect(screen.getByRole("link", "Open app")).toBeVisible();
    await expect(screen.getByRole("alert")).toContainText("needs review");
    await screen.getByRole("button", "Buy top-up").tap();
    await expect(screen.getByRole("status")).toContainText(
      "Checkout status could not be confirmed",
    );
    await update({ mode: "closed" });
    await screen.getByRole("button", "Buy top-up").tap();
    await expect(screen.getByRole("status")).toContainText(
      "previous checkout is closed",
    );
    await update({ mode: "url" });
    await screen.getByRole("button", "Buy top-up").tap();
    await expect(screen.getByRole("heading", "Fixture checkout")).toBeVisible();
    const calls = await attempts();
    expect(calls.length).toBe(4);
    expect(calls[0]?.requestId).toBe(calls[1]?.requestId);
    expect(calls[1]?.requestId).toBe(calls[2]?.requestId);
    expect(calls[3]?.requestId === calls[2]?.requestId).toBe(false);
  },
);

test(
  "expired malformed and wrong-account handoffs stay restricted on query-free pricing",
  { platforms: ["web"] },
  async ({ app, screen, browser }) => {
    test.skip(
      process.env.E2E_BILLING_WEB_FIXTURE !== "1",
      "Requires isolated billing browser fixture on ports 3450/3451",
    );
    await reset("topup");
    await app.open("/pricing");
    for (const value of [
      "invalid",
      JSON.stringify({
        userId: "alice",
        purchase: "topup",
        expiresAt: Date.now() - 1,
      }),
      JSON.stringify({
        userId: "alice",
        purchase: "topup",
        expiresAt: Date.now() + 120_000,
      }),
    ]) {
      await browser.evaluate((stored) => {
        sessionStorage.setItem("billing-from-ios", stored);
        sessionStorage.setItem("fixture-user", "bob");
        return null;
      }, value);
      await app.open("/pricing");
      await expect(
        screen.getByText(
          "After checkout, return to the app and refresh your credits.",
        ),
      ).toBeVisible();
      await expect(screen.getByRole("button", "Buy top-up")).toHaveCount(0);
      await expect(screen.getByRole("button", "Choose monthly")).toHaveCount(0);
    }
    await app.screenshot("wrong-account-restricted");
    expect((await attempts()).length).toBe(0);
  },
);

test(
  "mocked native storefront retains store and requires explicit continuation",
  { platforms: ["web"] },
  async ({ app, screen }) => {
    test.skip(
      process.env.E2E_BILLING_WEB_FIXTURE !== "1",
      "Requires isolated billing browser fixture on ports 3450/3451",
    );
    await reset("monthly", { balance: 9 });
    for (const path of [
      "/gate?storefront=CAN",
      "/gate?storefront=unknown",
      "/gate",
    ]) {
      await app.open(path);
      await expect(
        screen.getByRole("button", "Buy 500 credits · $5"),
      ).toBeVisible();
      await expect(
        screen.getByRole("button", "Buy monthly on website"),
      ).toHaveCount(0);
      await expect(
        screen.getByRole("button", "Buy top-up on website"),
      ).toHaveCount(0);
    }
    await app.open("/gate?storefront=USA");
    await expect(
      screen.getByRole("button", "Buy monthly on website"),
    ).toBeVisible();
    await expect(
      screen.getByRole("button", "Buy top-up on website"),
    ).toBeVisible();
    await expect(
      screen.getByRole("button", "Buy 500 credits · $5"),
    ).toBeVisible();
    await screen.getByRole("button", "Buy top-up on website").tap();
    await screen.getByRole("button", "Simulate app foreground").tap();
    await expect(screen.getByRole("button", "Continue")).toHaveCount(0);
    await update({ balance: 10 });
    await screen.getByRole("button", "Refresh credits").tap();
    await expect(screen.getByRole("button", "Continue")).toBeVisible();
    await update({ balance: 9 });
    await app.open("/gate?storefront=USA");
    await screen.getByRole("button", "Buy monthly on website").tap();
    await screen.getByRole("button", "Simulate app foreground").tap();
    await expect(screen.getByText("Credits: 9")).toBeVisible();
    await expect(screen.getByText("Gate continued")).toHaveCount(0);
    await update({ balance: 10 });
    await screen.getByRole("button", "Simulate app foreground").tap();
    await expect(screen.getByRole("button", "Continue")).toBeVisible();
    await expect(screen.getByText("Gate continued")).toHaveCount(0);
    await screen.getByRole("button", "Continue").tap();
    await expect(screen.getByText("Gate continued")).toBeVisible();
    await app.screenshot("native-gate-mock-ten-credits");
  },
);

test(
  "invalid links and typed source cannot unlock purchases; normal web remains available",
  { platforms: ["web"] },
  async ({ app, screen, browser }) => {
    test.skip(
      process.env.E2E_BILLING_WEB_FIXTURE !== "1",
      "Requires isolated billing browser fixture on ports 3450/3451",
    );
    await reset("topup", { expiresAt: Date.now() - 100 });
    await app.open(`/billing-login#${code}`);
    await expect(screen.getByRole("alert")).toContainText("expired");
    await app.open("/billing-login#malformed");
    await expect(screen.getByRole("alert")).toContainText("expired");
    await browser.evaluate(() => {
      sessionStorage.setItem("fixture-user", "alice");
      sessionStorage.removeItem("billing-from-ios");
      return null;
    });
    await app.open("/pricing?source=ios");
    await expect(screen.getByRole("button", "Buy top-up")).toHaveCount(0);
    await expect(screen.getByRole("button", "Choose monthly")).toHaveCount(0);
    await app.open("/pricing");
    await expect(screen.getByRole("button", "Buy top-up")).toBeVisible();
    await expect(screen.getByRole("button", "Choose monthly")).toBeVisible();
    expect((await attempts()).length).toBe(0);
  },
);

test(
  "return link is session-bound, channel-specific and absent for old or forged handoffs",
  { platforms: ["web"] },
  async ({ app, screen, browser }) => {
    test.skip(
      process.env.E2E_BILLING_WEB_FIXTURE !== "1",
      "Requires isolated billing browser fixture on ports 3450/3451",
    );
    for (const channel of ["production", "preview"]) {
      await reset("topup", {
        returnChannel: channel,
        returnExpiresAt: Date.now() + 300_000,
      });
      await app.open(`/billing-login#${code}`);
      await screen.getByRole("button", "Continue as @alice").tap();
      await expect(screen.getByRole("link", "Open app")).toHaveAttribute(
        "href",
        `disposabl-billing-97f7be92f4c3-${channel}://billing-return`,
      );
      await expect(screen.getByRole("button", "Buy top-up")).toBeVisible();
      expect((await attempts()).length).toBe(0);
      await app.screenshot(`return-${channel}`);
      await browser.evaluate(() => {
        const stored = JSON.parse(sessionStorage.getItem("billing-from-ios")!);
        stored.expiresAt = Date.now() - 1;
        sessionStorage.setItem("billing-from-ios", JSON.stringify(stored));
        return null;
      });
      await app.open("/pricing");
      await expect(screen.getByRole("button", "Buy top-up")).toHaveCount(0);
      await expect(screen.getByRole("link", "Open app")).toHaveAttribute(
        "href",
        `disposabl-billing-97f7be92f4c3-${channel}://billing-return`,
      );
    }
    await reset("topup");
    await app.open(`/billing-login#${code}`);
    await screen.getByRole("button", "Continue as @alice").tap();
    await expect(screen.getByRole("button", "Buy top-up")).toBeVisible();
    await expect(screen.getByRole("link", "Open app")).toHaveCount(0);
    await browser.evaluate((claim) => {
      sessionStorage.setItem(
        "billing-from-ios",
        JSON.stringify({
          userId: "alice",
          purchase: "topup",
          expiresAt: Date.now() + 120000,
          returnClaim: claim,
          returnUrl: "https://evil.example",
        }),
      );
      sessionStorage.setItem("fixture-user", "bob");
      return null;
    }, code);
    await app.open("/pricing?source=ios&returnUrl=https://evil.example");
    await expect(screen.getByRole("link", "Open app")).toHaveCount(0);
    expect((await attempts()).length).toBe(0);
  },
);
