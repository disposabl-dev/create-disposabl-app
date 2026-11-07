import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Marketing-only flows are removed from generated apps by reset.ts.
test(
  "landing platform choices reveal their stack and preserve dependencies",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, screen, browser }) => {
    await app.open("/");
    await screen.getByRole("button", "iOS", { exact: true }).tap();
    await expect(
      browser.locator('[data-stack="mobile"] .selected-targets'),
    ).toHaveText("Selected: Android");
    await screen.getByRole("button", "Android", { exact: true }).tap();
    await expect(browser.locator('[data-stack="mobile"]')).toHaveCount(0);
    await screen.getByRole("button", "CLI", { exact: true }).tap();
    await expect(
      screen.getByRole("button", "API", { exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(browser.locator('[data-stack="clients"]')).toBeVisible();
    await screen.getByRole("button", "TypeScript SDK", { exact: true }).tap();
    await screen.getByRole("button", "API", { exact: true }).tap();
    await expect(
      screen.getByRole("button", "CLI", { exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      screen.getByRole("button", "TypeScript SDK", { exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(browser.locator('[data-stack="api"]')).toHaveCount(0);
    await expect(browser.locator('[data-stack="clients"]')).toHaveCount(0);
    await expect(screen.getByRole("button", "Web included")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    for (const name of ["macOS", "Windows", "Linux", "MCP"])
      await screen.getByRole("button", name, { exact: true }).tap();
    await expect(
      browser.locator('[data-stack="desktop"] .selected-targets'),
    ).toHaveText("Selected: macOS + Windows + Linux");
    await expect(browser.locator('[data-stack="mcp"]')).toBeVisible();
  },
);

test(
  "coming soon downloads are inert and explain their status on focus",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await app.open("/");
    for (const [index, name] of [
      "Download on the App Store",
      "Get it on Google Play",
    ].entries()) {
      await expect(screen.getByRole("button", name)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await browser.evaluate((i) => {
        document
          .querySelectorAll<HTMLButtonElement>(".store-button")
          [i].focus();
        return true;
      }, index);
      await expect(browser.locator(`#store-tip-${index}`)).toBeVisible();
      await browser.keyboard.press("Enter");
      expect(new URL(await browser.url()).pathname).toBe("/");
    }
    await expect(
      screen.getByText(
        "Planned integration. Localization is not available in the starter yet.",
      ),
    ).toBeVisible();
  },
);

test(
  "all command options and clipboard failure keep a usable fallback",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await browser.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Clipboard denied for test");
          },
        },
      });
    });
    await app.open("/");
    await screen.getByRole("button", "Copy prompt", { exact: true }).tap();
    await expect(screen.getByRole("status")).toHaveText(
      "Select the text to copy it manually.",
    );
    await expect(browser.locator(".landing-prompt")).toContainText(
      "create-disposabl-app@latest",
    );
    await screen.getByRole("button", "Run a command").tap();
    for (const [name, command] of [
      ["Bun", "bunx"],
      ["npm", "npx"],
      ["pnpm", "pnpm dlx"],
      ["Yarn", "yarn dlx"],
    ]) {
      await screen.getByRole("button", name, { exact: true }).tap();
      await expect(browser.locator(".landing-terminal code")).toHaveText(
        `${command} create-disposabl-app@latest`,
      );
    }
  },
);

test(
  "small screen navigation supports keyboard dismissal and FAQ disclosure",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await browser.setViewport({ width: 390, height: 844 });
    await app.open("/");
    await screen.getByRole("button", "Open menu").tap();
    await expect(screen.getByRole("button", "Close menu")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await browser.keyboard.press("Escape");
    await expect(screen.getByRole("button", "Open menu")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      await browser.evaluate(
        () => document.activeElement?.getAttribute("aria-label") ?? null,
      ),
    ).toBe("Open menu");
    await browser
      .locator("#faq summary")
      .getByText("Is Disposabl really free?", { exact: true })
      .tap();
    await expect(browser.locator("#faq details[open] p")).toContainText(
      "$1 = 100 credits",
    );
    await screen.getByRole("button", "Open menu").tap();
    await screen.getByRole("link", "How it works", { exact: true }).tap();
    await expect(browser.locator("main h1")).toContainText(
      "From first command",
    );
  },
);

test(
  "marketing pages have readable layouts across mobile tablet and desktop",
  { platforms: ["web"], tags: ["landing"], timeout: 120_000 },
  async ({ app, browser }) => {
    await browser.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 375, 390, 640, 768, 1024, 1440, 1920]) {
      await browser.setViewport({ width, height: 900 });
      await app.open("/");
      await expect(browser.locator("#hero-title")).toBeVisible();
      const size = await browser.evaluate(() => ({
        viewport: innerWidth,
        body: document.documentElement.scrollWidth,
      }));
      expect(size.body).toBe(size.viewport);
      const clippedText = await browser.evaluate(() =>
        [
          ...document.querySelectorAll(
            "h1,h2,h3,.platform-toggle,.price-number",
          ),
        ]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.left < -1 || r.right > innerWidth + 1;
          })
          .map((e) => e.textContent),
      );
      expect(clippedText).toEqual([]);
      if ([320, 390, 768, 1440].includes(width))
        await app.screenshot(`landing-${width}`);
    }
    for (const path of ["/stack", "/build", "/why-disposabl"]) {
      await browser.setViewport({ width: 320, height: 800 });
      await app.open(path);
      await expect(browser.locator("main h1")).toBeVisible();
      expect(
        await browser.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
      ).toBe(true);
      const html = await (await fetch(new URL(path, app.baseUrl))).text();
      expect(html).toContain(
        'name="twitter:card" content="summary_large_image"',
      );
      expect(html).toContain(
        `rel="canonical" href="https://www.disposabl.dev${path}"`,
      );
    }
  },
);
