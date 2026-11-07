import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Marketing-only flows are removed from generated apps by reset.ts.
test(
  "dedicated stack page preserves dependencies and carries choices into setup",
  { platforms: ["web"], tags: ["landing"] },
  async ({ app, screen, browser }) => {
    await app.open("/stack");
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
    await browser.locator(".guide-end .primary-link").tap();
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
    await expect(browser.locator(".start-dialog [role=status]")).toHaveText(
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
      "Build your first app.",
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
      screen.getByRole("dialog", "Continue with your AI."),
    ).toBeVisible();
    await browser.keyboard.press("Escape");
    await expect(
      screen.getByRole("dialog", "Continue with your AI."),
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
      ["Booking app", "book an appointment"],
      ["Daily planner", "weekly goals"],
      ["Community app", "organize events"],
    ]) {
      await screen.getByRole("button", name, { exact: true }).tap();
      await expect(
        screen.getByRole("button", name, { exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await screen.getByRole("button", "Build this app", { exact: true }).tap();
      expect(
        await browser.evaluate(
          () =>
            (document.querySelector("#app-idea") as HTMLTextAreaElement).value,
        ),
      ).toContain(text);
      await expect(browser.locator(".start-dialog[open]")).toHaveCount(0);
      await browser.locator("#start").tap();
      await expect(browser.locator(".landing-prompt")).toContainText(text);
      await browser.keyboard.press("Escape");
    }
    await browser
      .locator("#app-idea")
      .fill("An app to organize my recipes and weekly shopping.");
    await browser.locator("#start").tap();
    await expect(browser.locator(".landing-prompt")).toContainText(
      "organize my recipes",
    );
    await browser.keyboard.press("Escape");
    await expect(browser.locator("#app-idea")).toHaveValue(
      "An app to organize my recipes and weekly shopping.",
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
    await screen.getByRole("link", "Explore Agent Mode", { exact: true }).tap();
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
    await browser.locator("#app-idea").fill("private custom draft");
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
    expect(url.hash).toBe("");
    await app.open("/?idea=planner");
    await expect(browser.locator("#app-idea")).toHaveValue(
      "A personal planner for my tasks, routines, and weekly goals. I want to see what matters today and keep track of my progress.",
    );
    await browser.locator("#start").tap();
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
      new URL("/?idea=community", app.baseUrl).href,
    );
  },
);
