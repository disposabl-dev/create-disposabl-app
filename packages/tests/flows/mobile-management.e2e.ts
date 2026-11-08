import { openMobile } from "../helpers/mobile";
import { test } from "@e2e-dev/mobile";
import { expect, type TestFixtures } from "e2e";
import config from "../../../disposabl.json";

async function openGuestSettings(screen: TestFixtures["screen"]) {
  await screen.getByRole("button", "Settings", { exact: true }).tap();
  const signIn = screen.getByRole("button", "Sign in", { exact: true });
  const logOut = screen.getByRole("button", "Log out", { exact: true });
  await expect(signIn.or(logOut)).toBeVisible();
  if (await logOut.isVisible()) {
    await logOut.tap();
    await expect(screen.getByRole("button", "Close settings")).toHaveCount(0);
    await expect(
      screen.getByRole("button", "Settings", { exact: true }),
    ).toHaveCount(1);
    await screen.getByRole("button", "Settings", { exact: true }).tap();
  }
}

test(
  "mobile settings are available before login",
  { platforms: ["ios", "android"] },
  async ({ app, screen, device }) => {
    test.skip(
      !config.features.includes("authentication"),
      "Requires authentication",
    );
    await openMobile({ app, device, screen });
    await expect(
      screen.getByRole("button", "Create app", { exact: true }),
    ).toBeVisible();
    await expect(
      screen
        .getByRole("tab", "Your apps", { exact: true })
        .or(screen.getByRole("button", "Your apps", { exact: true })),
    ).toBeVisible();
    await openGuestSettings(screen);
    await expect(screen.getByRole("button", /Appearance:/)).toBeVisible();
    await screen.getByRole("button", "Close settings", { exact: true }).tap();
    await expect(
      screen.getByRole("button", "Close settings", { exact: true }),
    ).toHaveCount(0);
    await expect(
      screen.getByRole("button", "Settings", { exact: true }),
    ).toBeVisible();
    await screen.getByRole("button", "Settings", { exact: true }).tap();
    await expect(screen.getByRole("button", /Appearance:/)).toBeVisible();
    await screen.getByRole("button", "Sign in", { exact: true }).tap();
    await expect(screen.getByRole("textbox", "Password")).toBeVisible();
  },
);

test(
  "mobile creation can be dismissed before submitting",
  { platforms: ["ios", "android"] },
  async ({ app, screen, device }) => {
    await openMobile({ app, device, screen });
    await screen.getByRole("button", "Create app", { exact: true }).tap();
    const close = screen.getByRole("button", "Close create app", {
      exact: true,
    });
    await expect(close).toBeVisible();
    await close.tap();
    await expect(close).toHaveCount(0);
    await expect(
      screen.getByRole("button", "Create app", { exact: true }),
    ).toBeVisible();
    await screen
      .getByRole("tab", "Guides", { exact: true })
      .or(screen.getByRole("button", "Guides", { exact: true }))
      .tap();
    await screen.getByRole("button", "Create a new app", { exact: true }).tap();
    await screen.getByRole("button", "Close create app", { exact: true }).tap();
    await expect(
      screen.getByText("Meet Disposabl", { exact: true }),
    ).toBeVisible();
  },
);

test(
  "mobile username login survives restart and signs out",
  { platforms: ["ios", "android"] },
  async ({ app, screen, device, platform }) => {
    test.skip(
      !config.features.includes("authentication"),
      "Requires authentication",
    );
    const url = process.env.E2E_CONVEX_URL;
    test.skip(
      !url ||
        !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname),
      "Requires a local isolated backend",
    );
    const response = await fetch(`${url}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "auth:providers",
        args: {},
        format: "json",
      }),
    }).then((r) => r.json());
    test.skip(
      response.value?.emailPassword || response.value?.googleOnly,
      "Requires username authentication",
    );
    const username = `mobile${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const password = `Mobile-${crypto.randomUUID()}!`;
    const signup = await fetch(`${url}/api/mutation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "auth:signUpWithUsernamePassword",
        args: { username, password },
        format: "json",
      }),
    }).then((r) => r.json());
    expect(signup.value?.status).toBe("complete");
    await openMobile({ app, device, screen });
    await openGuestSettings(screen);
    await screen.getByRole("button", "Sign in", { exact: true }).tap();
    const usernameInput = screen.getByRole("textbox", "Username", {
      exact: true,
    });
    await expect(usernameInput).toBeVisible();
    if (platform === "android") await usernameInput.tap();
    await usernameInput.fill(username);
    if (platform === "ios")
      await screen.getByText("next", { exact: true }).tap();
    await screen
      .getByRole("textbox", "Password", { exact: true })
      .fill(password);
    if (platform === "ios") await screen.getByText("go", { exact: true }).tap();
    else await screen.getByRole("button", "Log in", { exact: true }).tap();
    const savePassword = screen.getByRole("button", "Not Now", { exact: true });
    await expect(
      screen.getByText(username, { exact: true }).first().or(savePassword),
    ).toBeVisible();
    if (await savePassword.isVisible()) await savePassword.tap();
    await expect(
      screen.getByText(username, { exact: true }).first(),
    ).toBeVisible();
    await screen.getByRole("button", "Close settings").tap();
    if (!config.features.includes("payments")) {
      await screen.getByRole("button", "Create app", { exact: true }).tap();
      const idea = screen.getByRole("textbox", "Your app idea", {
        exact: true,
      });
      const draft = "A local test idea that must survive the connection gate.";
      await idea.fill(draft);
      await screen.getByRole("button", "Send message", { exact: true }).tap();
      await expect(
        screen.getByRole("button", "Connect accounts"),
      ).toBeVisible();
      await screen.getByRole("button", "Back to idea").tap();
      await expect(idea).toHaveValue(draft);
      await screen.getByRole("button", "Close create app").tap();
    }
    await expect(
      screen.getByRole("button", "Set up your workspace"),
    ).toBeVisible();
    await screen.getByRole("button", "Set up your workspace").tap();
    await expect(screen.getByRole("button", "Connect accounts")).toBeVisible();
    await expect(screen.getByText("0 of 2 essentials connected")).toBeVisible();
    await openMobile({ app, device, screen }, true);
    await expect(
      screen.getByRole("button", "Set up your workspace"),
    ).toBeVisible();
    await screen.getByRole("button", "Settings", { exact: true }).tap();
    await expect(
      screen.getByText(username, { exact: true }).first(),
    ).toBeVisible();
    await screen.getByRole("button", /Appearance:/).tap();
    await screen.getByText("Dark", { exact: true }).tap();
    await expect(screen.getByRole("button", "Appearance: Dark")).toBeVisible();
    await screen.getByRole("button", /Accent color:/).tap();
    await screen.getByText("Green", { exact: true }).tap();
    await expect(
      screen.getByRole("button", "Accent color: Green"),
    ).toBeVisible();
    await openMobile({ app, device, screen }, true);
    await screen.getByRole("button", "Settings", { exact: true }).tap();
    await expect(screen.getByRole("button", "Appearance: Dark")).toBeVisible();
    await expect(
      screen.getByRole("button", "Accent color: Green"),
    ).toBeVisible();
    await screen.getByRole("button", "Appearance: Dark").tap();
    await screen.getByText("System", { exact: true }).tap();
    await expect(
      screen.getByRole("button", "Appearance: System"),
    ).toBeVisible();
    await screen.getByRole("button", "Accent color: Green").tap();
    await screen.getByText("Blue", { exact: true }).tap();
    await expect(
      screen.getByRole("button", "Accent color: Blue"),
    ).toBeVisible();
    await openMobile({ app, device, screen }, true);
    await screen.getByRole("button", "Settings", { exact: true }).tap();
    await expect(
      screen.getByRole("button", "Appearance: System"),
    ).toBeVisible();
    await expect(
      screen.getByRole("button", "Accent color: Blue"),
    ).toBeVisible();
    await screen.getByRole("button", "Log out").tap();
    await expect(
      screen.getByRole("button", "Create app", { exact: true }),
    ).toBeVisible();
    await screen.getByRole("button", "Settings", { exact: true }).tap();
    await expect(
      screen.getByRole("button", "Sign in", { exact: true }),
    ).toBeVisible();
  },
);

test(
  "mobile guides retain their illustrated catalogue",
  { platforms: ["ios", "android"] },
  async ({ app, screen, device }) => {
    await openMobile({ app, device, screen });
    await screen
      .getByRole("tab", "Guides", { exact: true })
      .or(screen.getByRole("button", "Guides", { exact: true }))
      .tap();
    await expect(
      screen.getByRole("button", "Read What is an API?", { exact: true }),
    ).toBeVisible();
    await expect(
      screen.getByText("Fundamentals", { exact: true }),
    ).toBeVisible();
    await screen
      .getByRole("tab", "Discover", { exact: true })
      .or(screen.getByRole("button", "Discover", { exact: true }))
      .tap();
    await expect(
      screen.getByRole("button", "Create app", { exact: true }),
    ).toBeVisible();
  },
);
