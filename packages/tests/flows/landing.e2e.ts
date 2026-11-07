import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Marketing-only flows are removed from generated apps by reset.ts.
test(
  "dedicated stack page preserves dependencies and carries choices into setup",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, screen, browser }) => {
    await app.open("/stack");
    await expect(browser.locator("main h1")).toHaveCount(1);
    await expect(browser.locator("main h1")).toHaveText(
      "Choose where your app runs",
    );
    await screen.getByRole("button", "Android", { exact: true }).tap();
    await screen.getByRole("button", "iOS", { exact: true }).tap();
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
    await screen.getByRole("link", "Continue with these platforms").tap();
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
      await expect(
        browser.locator(`.maker-hero .store-button`).nth(index),
      ).toHaveAttribute("aria-disabled", "true");
      await browser.evaluate((i) => {
        document
          .querySelectorAll<HTMLButtonElement>(".maker-hero .store-button")
          [i].focus();
        return true;
      }, index);
      await expect(
        browser.locator(".maker-hero .store-tooltip").nth(index),
      ).toBeVisible();
      await browser.keyboard.press("Enter");
      expect(new URL(await browser.url()).pathname).toBe("/");
    }
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
    await browser.locator(".maker-hero .command-start").tap();
    await expect(browser.locator(".maker-hero .copy-fallback")).toContainText(
      "npx create-disposabl-app@latest",
    );
    await browser.locator("#start").tap();
    await expect(browser.locator(".maker-hero .copy-fallback")).toContainText(
      "Help me build an app with Disposabl. Read https://github.com/disposabl-dev/create-disposabl-app, then ask me what I want to make and where it should run.",
    );
    await browser.locator(".maker-hero .setup-help").tap();
    await browser.locator(".start-dialog .landing-copy-button").tap();
    await expect(browser.locator(".start-dialog [role=status]")).toHaveText(
      "Select the text to copy it manually.",
    );
    await expect(browser.locator(".landing-prompt")).toContainText(
      "https://github.com/disposabl-dev/create-disposabl-app",
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
    await browser.setViewport({ width: 844, height: 390 });
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
    await browser.setViewport({ width: 390, height: 844 });
    await browser
      .locator("#faq summary")
      .getByText("Is Disposabl really free?", { exact: true })
      .tap();
    await expect(browser.locator("#faq details[open] p")).toContainText(
      "$5 and includes 500 credits",
    );
    await screen.getByRole("button", "Open menu").tap();
    await browser.locator('#marketing-links a[href="/build"]').tap();
    await expect(browser.locator("main h1")).toContainText(
      "How to build with Disposabl",
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
    await browser.setViewport({ width: 844, height: 390 });
    await app.open("/");
    await expect(browser.locator("#hero-title")).toBeVisible();
    expect(
      await browser.evaluate(
        () => document.documentElement.scrollWidth === innerWidth,
      ),
    ).toBe(true);
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
  "hero actions fit on a standard phone and start dialog restores focus",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await browser.setViewport({ width: 390, height: 844 });
    await app.open("/");
    await expect(browser.locator("#hero-title")).toHaveText(
      "Make your own app. For free.",
    );
    await expect(browser.locator(".maker-hero .setup-prompt-text")).toHaveText(
      "Help me build an app with Disposabl. Read https://github.com/disposabl-dev/create-disposabl-app, then ask me what I want to make and where it should run.",
    );
    const visible = await browser.evaluate(() => {
      const actions = [
        ...document.querySelectorAll(
          ".maker-hero #start,.maker-hero .store-button",
        ),
      ];
      return (
        actions.length === 3 &&
        actions.every((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.top >= 0 &&
            r.bottom <= innerHeight &&
            r.left >= 0 &&
            r.right <= innerWidth
          );
        })
      );
    });
    expect(visible).toBe(true);
    await browser.locator(".maker-hero .setup-help").tap();
    await expect(
      screen.getByRole("dialog", "Continue with your AI."),
    ).toBeVisible();
    await browser.keyboard.press("Escape");
    await expect(
      screen.getByRole("dialog", "Continue with your AI."),
    ).toHaveCount(0);
    expect(
      await browser.evaluate(
        () => document.activeElement?.getAttribute("aria-label") ?? null,
      ),
    ).toBe("View setup instructions");
    await browser.locator("#pricing .primary-link").tap();
    await expect(browser.locator(".start-dialog[open]")).toBeVisible();
    await browser.keyboard.press("Escape");
    await screen.getByRole("button", "Open menu").tap();
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
      ["Booking app", "book an appointment"],
      ["Daily planner", "weekly goals"],
      ["Community app", "organize events"],
      ["Games", "memory matching game"],
      ["Team operations", "request approvals"],
    ]) {
      await screen.getByRole("button", name, { exact: true }).tap();
      await expect(
        screen.getByRole("button", name, { exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await screen.getByRole("button", "Build this app", { exact: true }).tap();
      await expect(browser.locator(".start-dialog[open]")).toBeVisible();
      await expect(browser.locator(".landing-prompt")).toContainText(text);
      await browser.keyboard.press("Escape");
    }
    await expect(browser.locator(".maker-hero textarea")).toHaveCount(0);
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
    await expect(browser.locator("html.dark")).toHaveCount(1);
    await browser.emulateMedia({ colorScheme: "light" });
    await expect(browser.locator("html.light")).toHaveCount(1);
    await screen.getByRole("button", "Toggle light and dark mode").tap();
    await expect(browser.locator("html.dark")).toHaveCount(1);
    await app.open("/stack");
    await expect(browser.locator("html.dark")).toHaveCount(1);
    for (const theme of ["dark", "light"]) {
      if (theme === "light")
        await screen.getByRole("button", "Toggle light and dark mode").tap();
      for (const width of [320, 390, 768, 1440]) {
        await browser.setViewport({ width, height: 900 });
        for (const path of ["/", "/stack", "/build", "/why-disposabl"]) {
          await app.open(path);
          await expect(browser.locator(`html.${theme}`)).toHaveCount(1);
          await expect(browser.locator("main h1")).toBeVisible();
          for (const dialog of path === "/" ? [false, true] : [false]) {
            if (dialog) await browser.locator(".maker-hero .setup-help").tap();
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

test(
  "homepage keeps implementation details on the stack page and example controls work",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await app.open("/");
    const home = await browser.evaluate(
      () => document.querySelector("main")?.textContent ?? "",
    );
    for (const word of [
      "TypeScript",
      "React Native",
      "Convex",
      "Turborepo",
      "Electron",
      "Big possibilities",
    ])
      expect(home).not.toContain(word);
    await expect(browser.locator(".platform-toggles")).toHaveCount(0);
    await screen.getByRole("button", "Booking app", { exact: true }).tap();
    await screen.getByRole("button", "Thu 19", { exact: true }).tap();
    await screen.getByRole("button", "14:00", { exact: true }).tap();
    await screen
      .getByRole("button", "Book Thu at 14:00", { exact: true })
      .tap();
    await expect(
      screen.getByRole("button", "Example booking confirmed"),
    ).toBeVisible();
    await screen.getByRole("button", "Daily planner", { exact: true }).tap();
    await screen.getByRole("button", "Finish the thing I started").tap();
    await expect(browser.locator(".planner-progress")).toContainText(
      "2 of 3 done",
    );
    await browser
      .locator('[aria-label="Add a demo task"]')
      .fill("Plan a picnic");
    await screen.getByRole("button", "Add task", { exact: true }).tap();
    await expect(screen.getByRole("button", "Plan a picnic")).toBeVisible();
    await expect(browser.locator(".planner-progress")).toContainText(
      "2 of 4 done",
    );
    await screen.getByRole("button", "Community app", { exact: true }).tap();
    await screen.getByRole("button", "Count me in", { exact: true }).tap();
    await expect(
      screen.getByRole("button", "You’re on the example guest list"),
    ).toHaveAttribute("aria-pressed", "true");
    await screen.getByRole("button", "You’re on the example guest list").tap();
    await expect(screen.getByRole("button", "Count me in")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  },
);

test(
  "pricing and build-time links reach the relevant guide sections",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await app.open("/");
    await browser.locator('#pricing a[href="/build#agent-mode"]').tap();
    await expect(browser.locator("#agent-mode[open]")).toBeVisible();
    await expect(browser.locator("#agent-mode")).toContainText("500 credits");
    await app.open("/");
    await screen
      .getByRole("link", "Build times and publishing guide", { exact: true })
      .tap();
    await expect(browser.locator("#build-times")).toBeVisible();
    expect(
      await browser.evaluate(() => {
        const r = document
          .querySelector("#build-times")!
          .getBoundingClientRect();
        return r.top >= 0 && r.top < innerHeight;
      }),
    ).toBe(true);
  },
);

test(
  "sharing an example copies only its generic idea and supports direct links",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await browser.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as any).__sharedUrl = text;
          },
        },
      });
    });
    await app.open("/");
    await expect(browser.locator(".maker-hero textarea")).toHaveCount(0);
    await screen.getByRole("button", "Daily planner", { exact: true }).tap();
    await screen.getByRole("button", "Share this idea", { exact: true }).tap();
    await expect(browser.locator(".share-feedback")).toContainText(
      "Link copied",
    );
    const copied = await browser.evaluate(
      () => (window as any).__sharedUrl as string,
    );
    const url = new URL(copied);
    expect(url.origin).toBe(new URL(await browser.url()).origin);
    expect(url.pathname).toBe("/");
    expect(url.search).toBe("?idea=planner");
    expect(url.hash).toBe("#examples");
    await app.open("/?idea=planner");
    await browser.locator(".maker-hero .setup-help").tap();
    await expect(browser.locator(".landing-prompt")).toContainText(
      "weekly goals",
    );
  },
);

test(
  "sharing shows a usable link when clipboard access fails",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await browser.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Clipboard denied");
          },
        },
      });
    });
    await app.open("/");
    await screen.getByRole("button", "Community app", { exact: true }).tap();
    await screen.getByRole("button", "Share this idea", { exact: true }).tap();
    await expect(browser.locator(".share-feedback")).toHaveText(
      new URL("/?idea=community#examples", app.baseUrl).href,
    );
  },
);

test(
  "game matching and operations approval work",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await app.open("/");
    await screen.getByRole("button", "Games", { exact: true }).tap();
    await screen.getByRole("button", "Card 1, face down").tap();
    await screen.getByRole("button", "Card 6, face down").tap();
    await expect(browser.locator(".game-score")).toContainText("1 / 6 pairs");
    await expect(browser.locator(".game-score")).toContainText("1 moves");
    await expect(screen.getByRole("button", "Card 1, star")).toHaveAttribute(
      "disabled",
      "",
    );
    await screen.getByRole("button", "Play again").tap();
    await expect(browser.locator(".game-score")).toContainText("0 / 6 pairs");
    await expect(browser.locator(".game-score")).toContainText("0 moves");
    await expect(screen.getByRole("button", "Card 1, face down")).toBeVisible();
    await screen.getByRole("button", "Team operations", { exact: true }).tap();
    await screen.getByRole("button", "Approve Design software").tap();
    await expect(browser.locator(".operations-total")).toContainText("2");
    await expect(
      screen.getByRole("button", "Approve Design software"),
    ).toHaveCount(0);
    await screen.getByRole("button", "Approved", { exact: true }).tap();
    await expect(
      screen.getByRole("button", "Design software approved"),
    ).toBeVisible();
    await expect(
      screen.getByRole("button", "Approve Team offsite"),
    ).toHaveCount(0);
    await screen.getByRole("button", "Pending", { exact: true }).tap();
    await expect(
      screen.getByRole("button", "Approve Team offsite"),
    ).toBeVisible();
  },
);

test(
  "new example sharing uses only the selected idea",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await browser.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as any).__sharedUrl = text;
          },
        },
      }),
    );
    await app.open("/");
    for (const [name, id] of [
      ["Games", "game"],
      ["Team operations", "operations"],
    ]) {
      await screen.getByRole("button", name, { exact: true }).tap();
      await screen
        .getByRole("button", "Share this idea", { exact: true })
        .tap();
      await expect(browser.locator(".share-feedback")).toContainText(
        "Link copied",
      );
      const copied = await browser.evaluate(
        () => (window as any).__sharedUrl as string,
      );
      expect(copied).toBe(new URL(`/?idea=${id}#examples`, app.baseUrl).href);
    }
  },
);

test(
  "navigation, language cloud and hero follow the design",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await browser.setViewport({ width: 1440, height: 900 });
    await app.open("/");
    await expect(browser.locator(".nav-controls")).toBeVisible();
    const desktop = await browser.evaluate(() => {
      const links = document
        .querySelector(".marketing-links")!
        .getBoundingClientRect();
      const controls = document
        .querySelector(".nav-controls")!
        .getBoundingClientRect();
      return controls.left - links.right;
    });
    expect(desktop >= 0 && desktop <= 24).toBe(true);
    const heroColors: string[] = [];
    for (const theme of ["light", "dark"]) {
      await browser.emulateMedia({ colorScheme: theme as "light" | "dark" });
      await expect(browser.locator(`html.${theme}`)).toHaveCount(1);
      const colors = await browser.evaluate(() => ({
        hero: getComputedStyle(document.querySelector(".maker-hero")!)
          .backgroundColor,
        page: getComputedStyle(document.querySelector(".launch-site")!)
          .backgroundColor,
      }));
      expect([colors.page, "rgba(0, 0, 0, 0)"]).toContain(colors.hero);
      heroColors.push(
        colors.hero === "rgba(0, 0, 0, 0)" ? colors.page : colors.hero,
      );
    }
    expect(heroColors[0]).not.toBe(heroColors[1]);
    for (const text of [
      "One idea. Everywhere.",
      "Free local builds. Your AI. Your code.",
      "Mobile app coming soon",
      "A few possibilities. Try these interactive examples, then start an app of your own.",
    ]) {
      expect(
        await browser.evaluate(
          (copy) =>
            Array.from(document.querySelectorAll("main *")).some(
              (el) =>
                el.children.length === 0 &&
                el.textContent?.trim() === copy &&
                (el as HTMLElement).offsetWidth > 0,
            ),
          text,
        ),
      ).toBe(false);
    }
    await expect(
      browser
        .locator(".app-foundation h3")
        .getByText("Analytics", { exact: true }),
    ).toBeVisible();
    await expect(
      browser
        .locator(".app-foundation h3")
        .getByText("85+ languages", { exact: true }),
    ).toBeVisible();
    await expect(browser.locator(".app-foundation")).toContainText(
      "Let people use your app in their language. Coming soon.",
    );
    await expect(browser.locator(".app-foundation")).toContainText(
      "documentation site",
    );
    await expect(browser.locator(".app-foundation")).toContainText("blog");
    await expect(
      browser.locator('footer nav[aria-label="Explore Disposabl"] a'),
    ).toHaveCount(4);
    await expect(
      browser.locator('footer nav[aria-label="Footer navigation"] a'),
    ).toHaveCount(4);
    await browser.setViewport({ width: 320, height: 568 });
    const mobile = await browser.evaluate(() => {
      const theme = document.querySelector(".theme-toggle")!;
      const menu = document.querySelector(".mobile-menu-button")!;
      const a = theme.getBoundingClientRect(),
        b = menu.getBoundingClientRect();
      return (
        theme.parentElement === menu.parentElement &&
        !!theme.parentElement?.classList.contains("nav-controls") &&
        b.left - a.right >= 0 &&
        b.left - a.right <= 24
      );
    });
    expect(mobile).toBe(true);
  },
);

test(
  "direct start actions copy their actual text and provide fallbacks",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await browser.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as any).__copied = text;
          },
        },
      }),
    );
    await app.open("/");
    await browser.locator(".maker-hero #start").tap();
    expect(
      await browser.evaluate(() => (window as any).__copied as string),
    ).toBe(
      "Help me build an app with Disposabl. Read https://github.com/disposabl-dev/create-disposabl-app, then ask me what I want to make and where it should run.",
    );
    await expect(browser.locator(".maker-hero .copy-start")).toContainText(
      "Copied",
    );
    await browser.locator(".maker-hero .command-start").tap();
    expect(
      await browser.evaluate(() => (window as any).__copied as string),
    ).toBe("npx create-disposabl-app@latest");
    await expect(browser.locator("footer .store-button")).toHaveCount(2);
    await expect(
      browser.locator("footer .store-button").nth(0),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      browser.locator("footer .store-button").nth(1),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(browser.locator("footer .footer-invitation")).toContainText(
      "Yours to make.",
    );
  },
);

test(
  "hero example and Agent Mode controls work",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await app.open("/");
    for (const label of ["Desktop", "Mobile", "Web"]) {
      await screen.getByRole("button", label, { exact: true }).tap();
      await expect(
        screen.getByRole("button", label, { exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    await screen.getByRole("button", "Save example trip").tap();
    await expect(browser.locator(".trip-save")).toContainText(
      "Saved to your example trips",
    );
    await screen.getByRole("button", "Remove example trip").tap();
    await expect(screen.getByRole("button", "Save example trip")).toBeVisible();
    for (const [label, text, task] of [
      ["Refine", "build, test, and improve", "Make booking easier"],
      ["Compare", "separate previews", "Explore two approaches"],
      ["Work in parallel", "separate conversations", "Continue your projects"],
    ]) {
      await screen.getByRole("button", label, { exact: true }).tap();
      await expect(
        screen.getByRole("button", label, { exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(browser.locator(".agent-mode-tabs p")).toContainText(text);
      await expect(browser.locator(".agent-window")).toContainText(task);
    }
  },
);

test(
  "stack exposes interfaces and optional plugin guidance",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser }) => {
    await app.open("/");
    await expect(browser.locator("main")).not.toContainText("plugins");
    await app.open("/stack");
    await expect(browser.locator(".interface-directory a")).toHaveCount(4);
    for (const name of ["MCP", "API", "CLI", "SDK"])
      await expect(browser.locator(".interface-directory")).toContainText(name);
    await expect(browser.locator(".plugin-details[open]")).toHaveCount(0);
    await browser.locator(".plugin-details summary").tap();
    await expect(browser.locator(".plugin-details[open]")).toBeVisible();
    await expect(browser.locator(".plugin-details")).toContainText(
      "Use Disposabl in your agent.",
    );
    await expect(browser.locator(".plugin-details")).toContainText(
      "Build a plugin for your app.",
    );
    await browser.locator(".plugin-details summary").tap();
    await expect(browser.locator(".plugin-details[open]")).toHaveCount(0);
  },
);

test(
  "direct example links select and reveal the requested demo",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, browser, screen }) => {
    await app.open("/?idea=game#examples");
    await expect(
      screen.getByRole("button", "Games", { exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(browser.locator(".example-game .game-app")).toBeVisible();
    expect(
      await browser.evaluate(() => {
        const rect = document
          .querySelector(".example-game")!
          .getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight;
      }),
    ).toBe(true);
    await screen.getByRole("button", "Build this app", { exact: true }).tap();
    await expect(
      browser.locator(".start-dialog[open] .landing-prompt"),
    ).toContainText("memory matching game");
    await app.open("/?idea=invalid#examples");
    await expect(
      screen.getByRole("button", "Daily planner", { exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      browser.locator(".example-planner .planner-app"),
    ).toBeVisible();
  },
);

test(
  "showcase navigation and playback controls",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, screen }) => {
    await app.open("/");
    await expect(
      screen.getByRole("button", "Play app examples"),
    ).toHaveAttribute("aria-pressed", "false");
    await screen.getByRole("button", "Next app example").tap();
    await expect(
      screen.getByRole("button", "Games", { exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await screen.getByRole("button", "Previous app example").tap();
    await expect(
      screen.getByRole("button", "Daily planner", { exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await screen.getByRole("button", "Play app examples").tap();
    await expect(
      screen.getByRole("button", "Pause app examples"),
    ).toHaveAttribute("aria-pressed", "true");
    await screen.getByRole("button", "Pause app examples").tap();
    await expect(
      screen.getByRole("button", "Play app examples"),
    ).toHaveAttribute("aria-pressed", "false");
  },
);
