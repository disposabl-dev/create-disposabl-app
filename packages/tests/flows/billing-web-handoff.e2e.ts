import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { randomUUID } from "node:crypto";
import { assertOwnedSdkBackend } from "../helpers/sdk-auth/ownership";

const api = "http://127.0.0.1:3451";
const code = "Q".repeat(43);
const realBackend = "http://127.0.0.1:3520";

async function realCall(
  kind: "query" | "mutation",
  path: string,
  args: object,
  token?: string,
) {
  const response = await fetch(`${realBackend}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path, args, format: "json" }),
    signal: AbortSignal.timeout(15_000),
  });
  const value = await response.json();
  if (value.status !== "success") throw new Error(`${path} rejected`);
  return value.value;
}

test(
  "real handoff fences revoked and expired native sessions while redeemed browser keeps its own owner",
  { platforms: ["web"] },
  async ({ app, screen, browser }) => {
    test.skip(
      process.env.E2E_BILLING_WEB_REAL !== "1",
      "Requires the isolated real handoff fixture",
    );
    if (
      process.env.E2E_CONVEX_URL !== realBackend ||
      process.env.E2E_CONVEX_SITE_URL !== "http://127.0.0.1:3521" ||
      process.env.E2E_TELEMETRY_DISABLED !== "1"
    )
      throw new Error("Requires isolated 3520/3521 and disabled telemetry");
    assertOwnedSdkBackend({
      markerVariable: "E2E_BILLING_OWNERSHIP_FILE",
      ports: [3520, 3521],
      claimDirectory: ".billing-web-real-claimed",
    });
    expect(await realCall("query", "fixtureBillingHandoff:ready", {})).toBe(
      true,
    );
    const account = async () => {
      const username = `handoff${randomUUID().replaceAll("-", "")}`;
      const signup = await realCall(
        "mutation",
        "auth:signUpWithUsernamePassword",
        { username, password: `Fixture-${randomUUID()}!` },
      );
      expect(signup.status).toBe("complete");
      const user = await realCall(
        "query",
        "users/index:current",
        {},
        signup.tokens.accessToken,
      );
      return { username, tokens: signup.tokens, userId: user.id };
    };
    const create = async (owner: Awaited<ReturnType<typeof account>>) => {
      const value = await realCall(
        "mutation",
        "billingHandoff:create",
        { purchase: "topup", returnChannel: "preview" },
        owner.tokens.accessToken,
      );
      expect(value.userId).toBe(owner.userId);
      return new URL(value.url).hash.slice(1);
    };
    const signOut = async (owner: Awaited<ReturnType<typeof account>>) => {
      await realCall(
        "mutation",
        "auth:signOut",
        { refreshToken: owner.tokens.refreshToken },
        owner.tokens.accessToken,
      );
      expect(
        await realCall(
          "query",
          "auth:isAuthenticated",
          {},
          owner.tokens.accessToken,
        ),
      ).toBe(false);
    };
    const revoked = await account();
    const revokedCode = await create(revoked);
    await app.open(`/billing-login#${revokedCode}`);
    await expect(
      screen.getByRole("button", `Continue as @${revoked.username}`),
    ).toBeVisible();
    await signOut(revoked);
    const nativeReplacement = await account();
    expect(nativeReplacement.userId).not.toBe(revoked.userId);
    await expect(screen.getByRole("alert")).toContainText("expired");
    expect(
      await realCall("query", "billingHandoff:inspect", { code: revokedCode }),
    ).toBe(null);

    const expiredOwner = await account();
    const expiredCode = await create(expiredOwner);
    await browser.evaluate((next) => {
      window.location.hash = next;
      return null;
    }, expiredCode);
    await expect(
      screen.getByRole("button", `Continue as @${expiredOwner.username}`),
    ).toBeVisible();
    await realCall("mutation", "fixtureBillingHandoff:expire", {
      code: expiredCode,
      field: "handoff",
    });
    await expect(screen.getByRole("alert")).toContainText("expired");

    const original = await account();
    const handoff = await create(original);
    await browser.evaluate((next) => {
      window.location.hash = next;
      return null;
    }, handoff);
    await expect(
      screen.getByRole("button", `Continue as @${original.username}`),
    ).toBeVisible();
    expect(await browser.evaluate(() => window.location.hash)).toBe("");
    await screen.getByRole("button", `Continue as @${original.username}`).tap();
    await expect(browser).toHaveURL("/pricing?source=ios");
    await expect(screen.getByRole("button", "Buy top-up")).toBeVisible();
    expect(
      await realCall("query", "billingHandoff:inspect", { code: handoff }),
    ).toBe(null);
    await signOut(original);
    const replacement = await account();
    expect(replacement.userId).not.toBe(original.userId);
    const browserUser = await browser.evaluate(async () => {
      const key = `__convexAuthJWT_${"http://127.0.0.1:3520".replace(/[^a-zA-Z0-9]/g, "")}`;
      const token = localStorage.getItem(key);
      if (!token) return null;
      const response = await fetch("http://127.0.0.1:3520/api/query", {
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
      });
      const result = await response.json();
      return result.status === "success" ? result.value?.id : null;
    });
    expect(browserUser).toBe(original.userId);
    await screen.getByRole("button", "Buy top-up").tap();
    await expect(screen.getByRole("status")).toContainText("being processed");
    expect(
      await browser.evaluate(
        (owner) => !!localStorage.getItem(`billing-attempt:${owner}:topup`),
        original.userId,
      ),
    ).toBe(true);
    expect(
      await browser.evaluate(
        (owner) => !!localStorage.getItem(`billing-attempt:${owner}:topup`),
        replacement.userId,
      ),
    ).toBe(false);
    let replayRejected = false;
    try {
      await realCall("mutation", "billingHandoff:redeem", { code: handoff });
    } catch {
      replayRejected = true;
    }
    expect(replayRejected).toBe(true);
  },
);
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

test(
  "snapshot denial preserves portal access and ignores a stale session response",
  { platforms: ["web"] },
  async ({ app, screen, browser }) => {
    test.skip(
      process.env.E2E_BILLING_WEB_FIXTURE !== "1",
      "Requires isolated billing browser fixture on ports 3450/3451",
    );
    await reset("topup", { mode: "snapshot-denied", holdPortal: true });
    await app.open("/pricing");
    await browser.evaluate(() => {
      (window as any).fixtureSetUser("alice");
      return null;
    });
    await expect(screen.getByRole("status")).toContainText(
      "Balance is unavailable",
    );
    expect(
      await screen.getByRole("button", "Choose monthly").isDisabled(),
    ).toBe(true);
    expect(await screen.getByRole("button", "Buy top-up").isDisabled()).toBe(
      true,
    );
    expect((await attempts()).length).toBe(0);
    await screen.getByRole("button", "Manage website billing").tap();
    await expect
      .poll(
        async () =>
          (await (await fetch(`${api}/state`)).json()).portalCalls.length,
      )
      .toBe(1);
    await browser.evaluate(() => {
      (window as any).fixtureSetUser("bob");
      return null;
    });
    await expect(screen.getByRole("status")).toContainText(
      "Balance is unavailable",
    );
    await update({ releasePortal: true });
    await expect
      .poll(
        async () =>
          (await (await fetch(`${api}/state`)).json()).portalCompleted,
      )
      .toBe(1);
    await expect(browser).not.toHaveURL("/portal");
    await expect(browser).toHaveURL("/pricing");
    await screen.getByRole("button", "Manage website billing").tap();
    await expect
      .poll(
        async () =>
          (await (await fetch(`${api}/state`)).json()).portalCalls.length,
      )
      .toBe(2);
    await update({ releasePortal: true });
    await expect(
      screen.getByRole("heading", "Fixture billing portal"),
    ).toBeVisible();
    const state = await (await fetch(`${api}/state`)).json();
    expect(state.portalCalls).toEqual(["alice", "bob"]);
    expect(state.attempts.length).toBe(0);
  },
);
