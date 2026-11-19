import { test } from "@e2e-dev/web";
import { expect } from "e2e";

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

    const description = browser.locator(".reel-description").first();
    await description.click();
    await expect.poll(async () => (await videoState())[0]?.paused).toBe(true);
    const closeDescription = screen.getByRole("button", "Close description");
    await expect(closeDescription).toBeFocused();
    await expect(browser.locator(".reel-sheet p")).toBeVisible();
    await expect(screen.getByText("Read transcript")).toHaveCount(0);
    await app.screenshot("guide-description");
    await closeDescription.click();
    await expect(description).toBeFocused();
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
    await browser.locator(".reel-description").first().click();
    await expect(screen.getByRole("button", "Close description")).toBeFocused();
    await app.screenshot("guide-desktop-description");
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
