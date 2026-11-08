import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { randomUUID } from "node:crypto";

const backend = "http://127.0.0.1:3530";
async function call(
  kind: "query" | "mutation",
  path: string,
  args: object,
  token?: string,
) {
  const response = await fetch(`${backend}/api/${kind}`, {
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
  "real billing handoff shows the owner and exchanges only after consent",
  { platforms: ["web"] },
  async ({ app, browser, screen }) => {
    test.skip(
      process.env.E2E_BILLING_HANDOFF_BROWSER !== "1",
      "Requires a disposable local billing handoff fixture",
    );
    if (
      process.env.E2E_CONVEX_URL !== backend ||
      process.env.E2E_CONVEX_SITE_URL !== "http://127.0.0.1:3531" ||
      process.env.E2E_TELEMETRY_DISABLED !== "1"
    )
      throw new Error(
        "Billing handoff browser fixture requires the isolated 3530/3531 backend and disabled telemetry.",
      );
    expect(await call("query", "fixtureBillingHandoff:ready", {})).toBe(true);
    const username = `billing${randomUUID().replaceAll("-", "")}`;
    const password = `Fixture-${randomUUID()}!`;
    const signup = await call("mutation", "auth:signUpWithUsernamePassword", {
      username,
      password,
    });
    expect(signup.status).toBe("complete");
    const create = async () => {
      const handoff = await call(
        "mutation",
        "billingHandoff:create",
        { purchase: "topup", returnChannel: "preview" },
        signup.tokens.accessToken,
      );
      const url = new URL(handoff.url);
      expect(url.origin).toBe("https://fixture.invalid");
      const code = url.hash.slice(1);
      expect(/^[A-Za-z0-9_-]{43}$/.test(code)).toBe(true);
      return code;
    };
    const code = await create();
    await app.open(`/billing-login#${code}`);
    await expect(browser).toHaveURL("/billing-login");
    await expect(
      screen.getByText(`@${username}`, { exact: true }),
    ).toBeVisible();
    await expect(
      screen.getByText("This signs this browser into the account shown above."),
    ).toBeVisible();
    await expect(
      screen.getByRole("button", `Continue as @${username}`),
    ).toBeVisible();
    expect(await call("query", "billingHandoff:inspect", { code })).toEqual({
      name: `@${username}`,
    });
    await screen.getByRole("button", `Continue as @${username}`).tap();
    await expect(browser).toHaveURL("/pricing?source=ios");
    await expect(screen.getByRole("heading", "Build your way.")).toBeVisible();
    expect(await call("query", "billingHandoff:inspect", { code })).toBe(null);
    const browserUser = await browser.evaluate(async () => {
      const key = `__convexAuthJWT_${"http://127.0.0.1:3530".replace(/[^a-zA-Z0-9]/g, "")}`;
      const token = localStorage.getItem(key);
      if (!token) return null;
      const response = await fetch("http://127.0.0.1:3530/api/query", {
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
      return result.status === "success" ? result.value?.username : null;
    });
    expect(browserUser).toBe(username);
    const expired = await create();
    await call("mutation", "fixtureBillingHandoff:expire", {
      code: expired,
      field: "handoff",
    });
    await app.open(`/billing-login#${expired}`);
    await expect(screen.getByRole("alert")).toContainText(
      "This link expired or your account could not be identified.",
    );
    await expect(
      screen.getByRole("button", `Continue as @${username}`),
    ).toHaveCount(0);
    const pending = await create();
    await call(
      "mutation",
      "users/index:requestDeletion",
      { confirmation: "DELETE" },
      signup.tokens.accessToken,
    );
    await app.open(`/billing-login#${pending}`);
    await expect(screen.getByRole("alert")).toContainText(
      "This link expired or your account could not be identified.",
    );
    await expect(
      screen.getByRole("button", `Continue as @${username}`),
    ).toHaveCount(0);
  },
);
