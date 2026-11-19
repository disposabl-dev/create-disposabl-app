import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { randomUUID } from "node:crypto";
import { backendUrl } from "../project.ts";

const checkMedia = process.env.E2E_GUIDES_MEDIA === "1";

test(
  "guides play one reel at a time and show a short description",
  { platforms: ["web"] },
  async ({ app, browser, screen }) => {
    test.skip(
      !checkMedia,
      "Enable E2E_GUIDES_MEDIA with a media catalog and test source.",
    );
    await browser.setViewport({ width: 390, height: 844 });
    await app.open("/guides");
    await expect(
      screen.getByRole("heading", "Guides", { exact: true }),
    ).toBeVisible();
    const card = browser.locator(".library-card").first();
    await card.click();
    await expect(screen.getByRole("dialog", "Guide player")).toBeVisible();
    const videoState = () =>
      browser.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLVideoElement>(".guide-player video"),
          (video) => ({
            paused: video.paused,
            time: video.currentTime,
            ready: video.readyState,
          }),
        ),
      );
    await expect
      .poll(async () => (await videoState())[0]?.ready, { timeout: 20000 })
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(async () => (await videoState())[0]?.time, { timeout: 20000 })
      .toBeGreaterThan(0);
    await expect.poll(async () => (await videoState())[0]?.paused).toBe(false);
    await app.screenshot("guide-playing");

    await screen.getByRole("button", "Pause video").first().click();
    await expect.poll(async () => (await videoState())[0]?.paused).toBe(true);
    await screen.getByRole("button", "Play video").first().click();
    await expect.poll(async () => (await videoState())[0]?.paused).toBe(false);
    await screen.getByRole("button", "Unmute video").click();
    await expect(screen.getByRole("button", "Mute video")).toBeVisible();

    await browser.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>(".reel-scroll")!;
      scroller.scrollBy({ top: scroller.clientHeight, behavior: "instant" });
      return null;
    });
    await expect
      .poll(
        async () => {
          const videos = await videoState();
          return videos[0]?.paused && !videos[1]?.paused && videos[1]?.time > 0;
        },
        { timeout: 20000 },
      )
      .toBe(true);
    expect(new URL(await browser.url()).searchParams.get("lesson")).toBe(
      "first-workflow",
    );
    await expect(screen.getByRole("button", "Mute video")).toBeVisible();
    await browser.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>(".reel-scroll")!;
      scroller.scrollBy({ top: -scroller.clientHeight, behavior: "instant" });
      return null;
    });
    await expect
      .poll(
        async () => {
          const videos = await videoState();
          return !videos[0]?.paused && videos[1]?.paused;
        },
        { timeout: 20000 },
      )
      .toBe(true);

    const description = screen.getByRole(
      "button",
      "About Welcome to Disposabl",
    );
    await description.click();
    await expect(description).toHaveAttribute("aria-expanded", "true");
    await expect(
      browser.locator(".reel-summary.expanded").first(),
    ).toBeVisible();
    await expect(screen.getByText("Read transcript")).toHaveCount(0);
    await app.screenshot("guide-description");
    await description.click();
    await expect(description).toHaveAttribute("aria-expanded", "false");
    await screen.getByRole("button", "Open comments").click();
    await expect.poll(async () => (await videoState())[0]?.paused).toBe(true);
    await expect(screen.getByRole("link", "Sign in to comment")).toBeVisible();
    await screen.getByRole("button", "Close comments").click();
    await expect.poll(async () => (await videoState())[0]?.paused).toBe(false);
    await screen.getByRole("button", "Close guide player").click();
    await expect(screen.getByRole("dialog", "Guide player")).toHaveCount(0);
    await expect(card).toBeFocused();
  },
);

test(
  "guides desktop playback and description",
  { platforms: ["web"] },
  async ({ app, browser, screen }) => {
    test.skip(
      !checkMedia,
      "Enable E2E_GUIDES_MEDIA with a media catalog and test source.",
    );
    await browser.setViewport({ width: 1440, height: 900 });
    await app.open("/guides");
    await browser.locator(".library-card").first().click();
    await expect
      .poll(
        () =>
          browser.evaluate(
            () =>
              document.querySelector<HTMLVideoElement>(".guide-player video")
                ?.currentTime ?? 0,
          ),
        { timeout: 20000 },
      )
      .toBeGreaterThan(0);
    const titleWithinVideo = await browser.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>(
        ".guide-player video",
      )!;
      const title = document.querySelector<HTMLElement>(".reel-description")!;
      const frame = video.getBoundingClientRect();
      const label = title.getBoundingClientRect();
      const width = Math.min(
        frame.width,
        (frame.height * video.videoWidth) / video.videoHeight,
      );
      const left = frame.left + (frame.width - width) / 2;
      return label.left >= left && label.right <= left + width;
    });
    expect(titleWithinVideo).toBe(true);
    await app.screenshot("guide-desktop-playing");
    await screen.getByRole("button", "About Welcome to Disposabl").click();
    await expect(
      screen.getByRole("button", "About Welcome to Disposabl"),
    ).toHaveAttribute("aria-expanded", "true");
    await app.screenshot("guide-desktop-description");
  },
);

test(
  "a shared lesson opens for guests and keeps its URL as videos change",
  { platforms: ["web"] },
  async ({ app, browser, screen }) => {
    await browser.setViewport({ width: 390, height: 844 });
    await app.open("/guides?lesson=first-workflow");
    await expect(screen.getByRole("dialog", "Guide player")).toBeVisible();
    await expect(
      screen.getByRole("button", "About Start with one useful thing"),
    ).toBeVisible();
    await expect(
      screen.getByRole("link", "Sign in to like video"),
    ).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fguides%3Flesson%3Dfirst-workflow",
    );
    await expect(screen.getByRole("button", "Share guide")).toBeVisible();
    await screen.getByRole("button", "Share guide").click();
    await expect(screen.getByRole("status")).toBeVisible();
    await screen.getByRole("button", "Close guide player").click();
    expect(new URL(await browser.url()).searchParams.has("lesson")).toBe(false);
  },
);

test(
  "signed-in viewers can like, comment, and remove their interactions",
  { platforms: ["web"] },
  async ({ app, browser, screen }) => {
    test.skip(
      process.env.E2E_GUIDES_SOCIAL !== "1",
      "Use an isolated backend for the Guides social flow.",
    );
    const backend = new URL(backendUrl());
    if (!["127.0.0.1", "localhost"].includes(backend.hostname))
      throw new Error("The social test requires an isolated loopback backend.");
    const username = `guidecheck${randomUUID().replaceAll("-", "")}`;
    const password = `Guide-${randomUUID()}!`;
    const comment = `This guide is helpful ${randomUUID()}`;
    await browser.setViewport({ width: 390, height: 844 });
    await app.open("/signup?returnTo=%2Fguides%3Flesson%3Dwelcome");
    await screen.getByRole("button", "Reject analytics").click();
    await screen.getByLabel("Username", { exact: true }).fill(username);
    await screen.getByLabel("Password", { exact: true }).fill(password);
    await screen.getByLabel("Confirm password", { exact: true }).fill(password);
    await screen.getByRole("button", "Create account", { exact: true }).tap();
    await expect(screen.getByRole("dialog", "Guide player")).toBeVisible();
    await screen.getByRole("button", "Like video").click();
    await expect(screen.getByRole("button", "Unlike video")).toBeVisible();
    await screen.getByRole("button", "Open comments").click();
    await screen.getByLabel("Add a comment").fill(comment);
    await screen.getByRole("button", "Post", { exact: true }).click();
    await expect(screen.getByText(comment)).toBeVisible();
    await screen.getByRole("button", "Delete", { exact: true }).click();
    await expect(screen.getByText(comment)).toHaveCount(0);
    await screen.getByRole("button", "Close comments").click();
    await screen.getByRole("button", "Unlike video").click();
    await expect(screen.getByRole("button", "Like video")).toBeVisible();
  },
);

test(
  "guide video can retry after a network failure",
  { platforms: ["web"] },
  async ({ app, browser, screen }) => {
    test.skip(
      !checkMedia,
      "Enable E2E_GUIDES_MEDIA with a media catalog and test source.",
    );
    await browser.route(/\.(?:m3u8|mp4)(?:\?|$)/, async (route) => {
      await route.abort();
    });
    await app.open("/guides");
    await browser.locator(".library-card").first().click();
    const retry = screen.getByRole("button", "Retry video");
    await expect(retry).toBeVisible({ timeout: 20000 });
    await browser.unrouteAll();
    await retry.click();
    await expect
      .poll(
        () =>
          browser.evaluate(
            () =>
              document.querySelector<HTMLVideoElement>(".guide-player video")
                ?.currentTime ?? 0,
          ),
        { timeout: 20000 },
      )
      .toBeGreaterThan(0);
  },
);
