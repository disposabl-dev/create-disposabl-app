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
    await browser.locator("#start").tap();
    await expect(browser.locator(".landing-prompt")).toContainText("macos");
    await screen.getByRole("button", "Run a command").tap();
    await expect(browser.locator(".landing-terminal code")).toContainText(
      "--platforms web,macos,windows,linux,mcp",
    );
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
    await expect(browser.locator("#language-title")).toBeVisible();
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
    await browser.locator("#start").tap();
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
        `${command} create-disposabl-app@latest --platforms web,android,ios`,
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
      "$5 and includes 500 credits",
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
            if (e.closest('[aria-hidden="true"]')) return false;
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

test(
  "both hero actions fit before scrolling and start dialog restores focus",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    for (const [width, height] of [
      [320, 568],
      [375, 667],
      [390, 844],
      [1440, 900],
    ]) {
      await browser.setViewport({ width, height });
      await app.open("/");
      const visible = await browser.evaluate(() =>
        [...document.querySelectorAll("#start,.store-button")].every((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.top >= 0 &&
            r.bottom <= innerHeight &&
            r.left >= 0 &&
            r.right <= innerWidth
          );
        }),
      );
      expect(visible).toBe(true);
    }
    await browser.locator("#start").tap();
    await expect(
      screen.getByRole("dialog", "Let's build your app."),
    ).toBeVisible();
    await browser.keyboard.press("Escape");
    await expect(
      screen.getByRole("dialog", "Let's build your app."),
    ).toHaveCount(0);
    expect(
      await browser.evaluate(() => document.activeElement?.id ?? null),
    ).toBe("start");
    await browser.locator("#pricing .primary-link").tap();
    await expect(browser.locator(".start-dialog[open]")).toBeVisible();
    await browser.keyboard.press("Escape");
    await browser.locator(".nav-start").tap();
    await expect(browser.locator(".start-dialog[open]")).toBeVisible();
    await browser.keyboard.press("Escape");
    await app.open("/#start");
    await expect(browser.locator(".start-dialog[open]")).toBeVisible();
  },
);

test(
  "outcome choices prepare useful prompts and pricing shows the credit allowance",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await app.open("/");
    await expect(browser.locator(".agent-price .price-number")).toHaveText(
      "$5",
    );
    await expect(browser.locator(".agent-price ul")).toContainText(
      "500 credits",
    );
    for (const [name, text] of [
      ["Take bookings", "appointment booking"],
      ["Open your shop", "online shop"],
      ["Bring your team together", "workspace"],
      ["Teach what you know", "learning app"],
    ]) {
      await screen.getByRole("button", name, { exact: true }).tap();
      await expect(
        browser.locator(".start-dialog[open] .landing-prompt"),
      ).toContainText(text);
      await screen.getByRole("button", "Copy prompt", { exact: true }).tap();
      await expect(screen.getByRole("status")).toHaveText(
        "Copied to clipboard.",
      );
      await browser.keyboard.press("Escape");
    }
    await browser.locator("#start").tap();
    await expect(browser.locator(".landing-prompt")).toHaveText(
      "Build my app with create-disposabl-app@latest. Ask me what I want to make. Use these platforms: web, android, ios.",
    );
  },
);

test(
  "themes follow the system then persist the visitor choice without small text",
  { platforms: ["web"], tags: ["landing"], timeout: 120000 },
  async ({ app, browser, screen }) => {
    await browser.emulateMedia({
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    await app.open("/");
    await expect(browser.locator("html")).toHaveAttribute("class", "dark");
    await browser.emulateMedia({ colorScheme: "light" });
    await expect(browser.locator("html")).toHaveAttribute("class", "light");
    await screen.getByRole("button", "Toggle light and dark mode").tap();
    await expect(browser.locator("html")).toHaveAttribute("class", "dark");
    await app.open("/stack");
    await expect(browser.locator("html")).toHaveAttribute("class", "dark");
    for (const theme of ["dark", "light"]) {
      if (theme === "light")
        await screen.getByRole("button", "Toggle light and dark mode").tap();
      for (const width of [320, 390, 768, 1440]) {
        await browser.setViewport({ width, height: 900 });
        for (const path of ["/", "/stack", "/build", "/why-disposabl"]) {
          await app.open(path);
          await expect(browser.locator("html")).toHaveAttribute("class", theme);
          await expect(browser.locator("main h1")).toBeVisible();
          for (const dialog of path === "/" ? [false, true] : [false]) {
            if (dialog) await browser.locator("#start").tap();
            const undersized = await browser.evaluate(() => {
              const root = document.querySelector(".launch-site")!;
              const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT,
              );
              const failures: string[] = [];
              let node: Node | null;
              while ((node = walker.nextNode())) {
                const el = node.parentElement;
                if (
                  !el ||
                  !node.textContent?.trim() ||
                  el.closest('.sr-only,[aria-hidden="true"],script,style')
                )
                  continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                const box = range.getBoundingClientRect();
                const style = getComputedStyle(el);
                if (
                  box.width > 0 &&
                  box.height > 0 &&
                  style.visibility !== "hidden" &&
                  parseFloat(style.fontSize) < 16
                )
                  failures.push(
                    `${node.textContent.trim()}: ${style.fontSize}`,
                  );
              }
              return failures;
            });
            expect(undersized).toEqual([]);
            if (dialog) await browser.keyboard.press("Escape");
          }
          expect(
            await browser.evaluate(
              () => document.documentElement.scrollWidth === innerWidth,
            ),
          ).toBe(true);
          if (path === "/") await app.screenshot(`landing-${theme}-${width}`);
        }
      }
    }
  },
);
