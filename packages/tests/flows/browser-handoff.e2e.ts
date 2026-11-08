import { test, expect } from "e2e";
import { test as webTest } from "@e2e-dev/web";
import { handoffCall, handoffFixture } from "../helpers/browser-handoff.ts";
import { backendUrl } from "../project.ts";
const local = () =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(backendUrl()).hostname);

test(
  "mobile handoff issues an independent browser session exactly once",
  { platforms: ["backend"] },
  async () => {
    test.skip(!local(), "Requires isolated loopback authentication fixtures");
    expect(
      (await handoffCall("mutation", "browserHandoff:create", {})).status,
    ).toBe("error");
    const fixture = await handoffFixture();
    const results = await Promise.all(
      [0, 1].map(() =>
        handoffCall("mutation", "browserHandoff:redeem", {
          code: fixture.code,
        }),
      ),
    );
    expect(results.filter((result) => result.status === "success").length).toBe(
      1,
    );
    const browser = results.find(
      (result) => result.status === "success",
    )!.value;
    expect(browser.userId).toBe(fixture.userId);
    expect(browser.accessToken === fixture.token).toBe(false);
    expect(
      (
        await handoffCall(
          "query",
          "auth:isAuthenticated",
          {},
          browser.accessToken,
        )
      ).value,
    ).toBe(true);
    expect(
      (
        await handoffCall(
          "mutation",
          "auth:signOut",
          { refreshToken: browser.refreshToken },
          browser.accessToken,
        )
      ).status,
    ).toBe("success");
    expect(
      (
        await handoffCall(
          "query",
          "auth:isAuthenticated",
          {},
          browser.accessToken,
        )
      ).value,
    ).toBe(false);
    expect(
      (await handoffCall("query", "auth:isAuthenticated", {}, fixture.token))
        .value,
    ).toBe(true);
    expect(
      (
        await handoffCall("mutation", "browserHandoff:redeem", {
          code: fixture.code,
        })
      ).status,
    ).toBe("error");
    const revoked = await handoffFixture();
    expect(
      (
        await handoffCall(
          "mutation",
          "auth:signOut",
          { refreshToken: revoked.refreshToken },
          revoked.token,
        )
      ).status,
    ).toBe("success");
    expect(
      (
        await handoffCall("mutation", "browserHandoff:redeem", {
          code: revoked.code,
        })
      ).status,
    ).toBe("error");
  },
);

webTest(
  "mobile login opens browser connections without another provider sign-in",
  { platforms: ["web"] },
  async ({ app, screen, browser }) => {
    webTest.skip(
      !local(),
      "Requires isolated loopback authentication fixtures",
    );
    const fixture = await handoffFixture();
    await app.open(fixture.path);
    await expect(
      screen.getByRole("button", `Continue as @${fixture.username}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(browser).toHaveURL("/mobile-login");
    await screen
      .getByRole("button", `Continue as @${fixture.username}`, { exact: true })
      .tap();
    await expect(
      screen.getByRole("heading", "Connect your accounts.", { exact: true }),
    ).toBeVisible();
    await app.restart();
    await app.open("/dashboard/connections");
    await expect(
      screen.getByRole("heading", "Connect your accounts.", { exact: true }),
    ).toBeVisible();
    expect(
      (await handoffCall("query", "auth:isAuthenticated", {}, fixture.token))
        .value,
    ).toBe(true);
    await app.open(fixture.path);
    await expect(screen.getByRole("alert")).toHaveText(
      "This link expired. Open connections again from the app.",
    );
  },
);

webTest(
  "mobile handoff keeps Expo required through sign-in",
  { platforms: ["web"] },
  async ({ app, screen, browser }) => {
    webTest.skip(
      !local(),
      "Requires isolated loopback authentication fixtures",
    );
    const fixture = await handoffFixture(true);
    await app.open(fixture.path);
    await expect(
      screen.getByRole("button", `Continue as @${fixture.username}`, {
        exact: true,
      }),
    ).toBeVisible();
    // The credential and option are removed from browser history before redemption.
    await expect(browser).toHaveURL("/mobile-login");
    await screen
      .getByRole("button", `Continue as @${fixture.username}`, { exact: true })
      .tap();
    await expect(
      screen.getByText("Your mobile app also needs Expo.", { exact: false }),
    ).toBeVisible();
    await expect(browser).toHaveURL(
      "/dashboard/connections?origin=mobile&mobile=1",
    );
  },
);
