import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "public support and privacy contacts remain accessible",
  { platforms: ["web"], requires: ["browser"] },
  async ({ app, screen, browser }) => {
    const origin = new URL(app.baseUrl!).origin;
    await browser.route("**/*", async (route) => {
      const url = new URL(route.request.url);
      if (url.origin === origin) await route.continue();
      else await route.abort();
    });
    await browser.setViewport({ width: 390, height: 844 });
    for (const path of ["/support", "/support/"]) {
      await app.open(path);
      await expect(screen.getByRole("heading", "Support")).toBeVisible();
      const contact = screen.getByRole("link", "vivek@yast.ai");
      await expect(contact).toBeVisible();
      await expect(contact).toHaveAttribute("href", "mailto:vivek@yast.ai");
      await browser.reload();
      await expect(contact).toBeVisible();
      expect(
        await browser.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await app.screenshot("support-mobile");
    const legalLink = screen.getByRole("link", "Legal and privacy information");
    await legalLink.focus();
    await expect(legalLink).toBeFocused();
    await legalLink.press("Enter");
    await expect(screen.getByRole("heading", "Legal & privacy")).toBeVisible();
    const privacyLink = screen.getByRole(
      "link",
      "Privacy requests Ask to access, correct, export, or delete your personal information.",
    );
    await privacyLink.focus();
    await expect(privacyLink).toBeFocused();
    await privacyLink.press("Enter");
    await expect(screen.getByRole("heading", "Privacy requests")).toBeVisible();
    await expect(screen.getByRole("link", "vivek@yast.ai")).toHaveAttribute(
      "href",
      "mailto:vivek@yast.ai",
    );
    await app.open("/legal/privacy");
    await expect(screen.getByRole("heading", "Privacy policy")).toBeVisible();
    await expect(browser.locator('[role="note"]')).toContainText(
      "Draft documents",
    );
    await expect(
      screen.getByText("Yast AI operates Disposabl", { exact: false }),
    ).toBeVisible();
    await expect(
      screen.getByText(
        "For privacy questions or requests, contact vivek@yast.ai",
        { exact: false },
      ),
    ).toBeVisible();
    await app.open("/legal/delete-account");
    await expect(
      screen.getByRole("heading", "Delete your account"),
    ).toBeVisible();
    await expect(browser.locator('[role="note"]')).toContainText(
      "Draft documents",
    );
    await expect(screen.getByRole("link", "vivek@yast.ai")).toHaveAttribute(
      "href",
      "mailto:vivek@yast.ai",
    );
    await expect(
      screen.getByText("A request does not itself delete your account", {
        exact: false,
      }),
    ).toBeVisible();
    expect(
      await browser.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await app.screenshot("delete-account-mobile");
  },
);
