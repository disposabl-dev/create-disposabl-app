import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import config from "../../../disposabl.json";
import { legalConfig } from "../../disposabl-kit/legal";

for (const [path, title] of [
  ["/legal/privacy", "Privacy policy"],
  ["/legal/terms", "Terms of service"],
] as const) {
  test(
    `${title} is public and identified as a draft`,
    { platforms: ["web"] },
    async ({ app, screen, browser }) => {
      await app.open(path);
      await expect(screen.getByRole("heading", title)).toBeVisible();
      await expect(browser.locator('[role="note"]')).toHaveText(
        "Draft documents. Publisher details and data practices are still being reviewed. These documents are not yet final.",
      );
      await expect(
        screen.getByRole("link", "All legal documents"),
      ).toBeVisible();
    },
  );
}

test(
  "legal overview exposes working privacy controls",
  { platforms: ["web"] },
  async ({ app, screen }) => {
    await app.open("/legal");
    await expect(
      screen.getByRole("navigation", "Legal documents"),
    ).toBeVisible();
    await app.open("/legal/delete-account");
    await expect(screen.getByRole("heading", "Privacy contact")).toBeVisible();
    await expect(
      screen.getByText("The publisher has not provided a privacy contact yet."),
    ).toBeVisible();
  },
);

test(
  "support is public and deletion directs guests to sign in",
  { platforms: ["web"] },
  async ({ app, screen }) => {
    await app.open("/support");
    await expect(screen.getByRole("heading", "Support")).toBeVisible();
    if (legalConfig.privacyEmail)
      await expect(
        screen.getByRole("link", legalConfig.privacyEmail),
      ).toBeVisible();
    else
      await expect(
        screen.getByText(
          "The publisher has not provided a support contact yet.",
        ),
      ).toBeVisible();
    await app.open("/legal/delete-account");
    if (config.features.includes("authentication")) {
      await expect(
        screen.getByRole("link", "Sign in", { exact: true }).last(),
      ).toBeVisible();
      await expect(
        screen.getByText("Sign in to manage your account deletion request."),
      ).toBeVisible();
    }
  },
);
