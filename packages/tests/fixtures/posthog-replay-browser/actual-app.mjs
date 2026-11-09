import { chromium } from "playwright-core";
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { resolve, sep } from "node:path";

const output = resolve(process.env.REPLAY_APP_DIST || "");
if (!process.env.REPLAY_APP_DIST || !process.env.REPLAY_CHROMIUM)
  throw new Error("Set REPLAY_APP_DIST and REPLAY_CHROMIUM");
const entry = await Bun.build({
  entrypoints: [
    resolve("packages/tests/fixtures/posthog-replay-browser/entry.ts"),
  ],
  target: "browser",
  format: "iife",
});
assert.ok(entry.success);
const bundle = await entry.outputs[0].text();
const sdk = await readFile(
  resolve("node_modules/posthog-js/dist/array.full.no-external.js"),
  "utf8",
);
const browser = await chromium.launch({
  executablePath: process.env.REPLAY_CHROMIUM,
  headless: true,
  args: ["--disable-background-networking"],
});
const context = await browser.newContext({ serviceWorkers: "block" });
const page = await context.newPage();
const requests = [];
const failures = [];
page.on("pageerror", (error) =>
  failures.push({ path: new URL(page.url()).pathname, message: error.message }),
);
try {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.host === "posthog.invalid") {
      requests.push({ path: url.pathname, body: request.postData() });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sessionRecording: {
            endpoint: "/s/",
            consoleLogRecordingEnabled: true,
            recordCanvas: true,
            networkPayloadCapture: {
              recordHeaders: true,
              recordBody: true,
              capturePerformance: true,
            },
          },
          capturePerformance: true,
          featureFlags: {},
        }),
      });
    }
    if (url.host !== "fixture.invalid") return route.abort();
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "success",
          value: { id: "SECRET_ACCOUNT_91", username: "SECRET_ACCOUNT_91" },
        }),
      });
    let name = decodeURIComponent(url.pathname);
    if (name === "/") name = "/index.html";
    else if (!name.includes(".")) name += "/index.html";
    let file = resolve(output, "." + name);
    if (!file.startsWith(output + sep)) return route.abort();
    let content;
    try {
      content = await readFile(file);
    } catch {
      file = resolve(output, "_shell.html");
      content = await readFile(file);
    }
    return route.fulfill({ status: 200, path: file, body: content });
  });
  // Establish whether test-only auth and SPA-shell hydration produce errors without the SDK.
  const baselineErrors = [];
  const baseline = await context.newPage();
  baseline.on("pageerror", (error) =>
    baselineErrors.push({
      path: new URL(baseline.url()).pathname,
      message: error.message,
    }),
  );
  await baseline.goto("https://fixture.invalid/", {
    waitUntil: "domcontentloaded",
  });
  await baseline.evaluate(() => localStorage.setItem("fixture-session", "A"));
  for (const path of [
    "/dashboard/SECRET_PATH_91",
    "/consent?request=fixture",
  ]) {
    await baseline.goto(`https://fixture.invalid${path}`, {
      waitUntil: "domcontentloaded",
    });
    await baseline.waitForTimeout(500);
  }
  await baseline.evaluate(() => localStorage.removeItem("fixture-session"));
  await baseline.close();
  await page.addInitScript({ content: sdk });
  await page.addInitScript({ content: bundle });
  await page.addInitScript(() => {
    window.fixtureInitialBody = "unobserved";
    const observer = new MutationObserver(() => {
      if (document.body && window.fixtureInitialBody === "unobserved") {
        window.fixtureInitialBody =
          document.body.getAttribute("data-replay-public");
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
    const enabled = () =>
      localStorage.getItem("disposabl.product.analytics.optout.v1") !== "1";
    if (!enabled()) return;
    window.posthog.init("phc_fixture", {
      api_host: "https://posthog.invalid",
      persistence: "memory",
      autocapture: false,
      opt_out_useragent_filter: true,
      capture_pageview: false,
      capture_pageleave: false,
      disable_compression: true,
      request_batching: false,
      advanced_disable_feature_flags: true,
      disable_external_dependency_loading: true,
      disable_surveys: true,
      enable_recording_console_log: false,
      capture_performance: false,
      session_recording: window.replayOptions(),
      before_send(event) {
        if (
          event.event !== "$snapshot" ||
          !enabled() ||
          !window.publicReplayPath(location.pathname)
        )
          return null;
        const properties = window.replayProperties(
          event.properties,
          "phc_fixture",
          "fixture-id",
        );
        return properties
          ? {
              uuid: event.uuid,
              event: event.event,
              timestamp: event.timestamp,
              properties,
            }
          : null;
      },
    });
    window.posthog.startSessionRecording();
    window.addEventListener("disposabl-product-analytics-preference", () => {
      if (!enabled()) {
        window.posthog.stopSessionRecording();
        window.posthog.opt_out_capturing();
        window.posthog.reset(true);
      }
    });
  });
  const routes = [
    "/login",
    "/signup",
    "/consent",
    "/legal/delete-account",
    "/dashboard/SECRET_PATH_91",
  ];
  for (const path of routes) {
    await page.goto(
      "https://fixture.invalid" + path + "?x=SECRET_QUERY_91#SECRET_HASH_91",
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForTimeout(700);
    assert.equal(
      await page.evaluate(() => window.fixtureInitialBody),
      null,
      `unsafe initial body on ${path}`,
    );
    if (path === "/login" || path === "/signup") {
      const inputs = page.locator("input");
      assert.ok((await inputs.count()) > 0, `${path} form not visible`);
      await inputs.first().fill("SECRET_INPUT_91");
    }
    await page.evaluate(() => {
      const marker = document.createElement("private-app-content-marker");
      marker.textContent = "SECRET_PRIVATE_91";
      marker.setAttribute("data-private", "SECRET_ATTR_91");
      document.body.append(marker);
    });
    await page.waitForTimeout(300);
  }
  await page.goto("https://fixture.invalid/?x=SECRET_QUERY_91#SECRET_HASH_91", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => document.body?.getAttribute("data-replay-public") === "true",
  );
  assert.ok(
    (await page.locator("body").innerText()).length > 50,
    "public application did not render",
  );
  await page.evaluate(() => {
    const node = document.createElement("section");
    node.innerHTML =
      '<p data-seeded="SECRET_PUBLIC_ATTR_91">SECRET_PUBLIC_TEXT_91</p><input value="SECRET_PUBLIC_INPUT_91"><img src="https://image.invalid/SECRET_IMAGE_91"><iframe src="https://image.invalid/SECRET_IFRAME_91"></iframe><canvas></canvas><private-app-content-marker data-sensitive>SECRET_PRIVATE_91</private-app-content-marker>';
    document.body.append(node);
  });
  await page.locator("body").click({ position: { x: 15, y: 100 } });
  await page.waitForTimeout(3000);
  const link = page.locator('a[href="/login"]:visible').first();
  assert.ok(await link.count(), "no actual login navigation link");
  await link.click();
  await page.waitForURL("**/login**");
  await page.waitForTimeout(300);
  assert.notEqual(
    await page.locator("body").getAttribute("data-replay-public"),
    "true",
  );
  await page.evaluate(() => {
    const marker = document.createElement("private-app-content-marker");
    marker.textContent = "SECRET_PRIVATE_91";
    document.body.append(marker);
  });
  const home = page.locator('a[href="/"]:visible').first();
  await home.click();
  await page.waitForURL("https://fixture.invalid/");
  await page.waitForFunction(
    () => document.body?.getAttribute("data-replay-public") === "true",
  );
  await page.locator("body").click({ position: { x: 15, y: 100 } });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    localStorage.setItem("fixture-session", "A");
    window.dispatchEvent(new Event("fixture-auth-change"));
  });
  await page.goto("https://fixture.invalid/consent?request=fixture", {
    waitUntil: "domcontentloaded",
  });
  await page.getByText("SECRET_CLIENT_91").waitFor({ timeout: 10000 });
  assert.notEqual(
    await page.locator("body").getAttribute("data-replay-public"),
    "true",
  );
  await page.goto(
    "https://fixture.invalid/dashboard/api-keys?x=SECRET_QUERY_91#SECRET_HASH_91",
    { waitUntil: "domcontentloaded" },
  );
  await page.getByText("SECRET_API_KEY_LABEL_A").waitFor({ timeout: 10000 });
  assert.notEqual(
    await page.locator("body").getAttribute("data-replay-public"),
    "true",
  );
  await page.evaluate(() => {
    localStorage.setItem("fixture-session", "B");
    window.dispatchEvent(new Event("fixture-auth-change"));
  });
  await page.getByText("SECRET_API_KEY_LABEL_B").waitFor({ timeout: 10000 });
  const logout = page.getByText("Logout", { exact: true });
  await logout.click({ timeout: 10000 });
  await page.waitForFunction(
    () => localStorage.getItem("fixture-session") === "",
  );
  await page.goto("https://fixture.invalid/", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => document.body?.getAttribute("data-replay-public") === "true",
  );
  await page.locator("body").click({ position: { x: 15, y: 100 } });
  await page.waitForTimeout(3000);
  const beforeOptOut = requests.filter(
    (x) => x.path.startsWith("/s/") && x.body,
  ).length;
  await page.getByRole("button", { name: "Allow analytics: yes" }).click();
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("disposabl.product.analytics.optout.v1"),
    ),
    "1",
  );
  await page.evaluate(() => {
    const marker = document.createElement("div");
    marker.textContent = "SECRET_AFTER_OPTOUT_91";
    document.body.append(marker);
  });
  await page.waitForTimeout(2500);
  assert.equal(
    requests.filter((x) => x.path.startsWith("/s/") && x.body).length,
    beforeOptOut,
    "new replay request after opt-out",
  );
  const snapshots = requests
    .filter((x) => x.path.startsWith("/s/") && x.body)
    .map((x) => JSON.parse(x.body));
  assert.ok(
    snapshots.length > 0,
    "no replay payload captured from actual public app",
  );
  let decoded = 0;
  for (const snap of snapshots) {
    const payload = [JSON.stringify(snap)];
    for (const item of snap.properties.$snapshot_data) {
      if (typeof item.data === "string" && item.data.charCodeAt(0) === 31) {
        payload.push(
          gunzipSync(Buffer.from(item.data, "latin1")).toString("utf8"),
        );
        decoded++;
      } else payload.push(JSON.stringify(item));
    }
    for (const marker of [
      "SECRET_INPUT_91",
      "SECRET_PRIVATE_91",
      "SECRET_ATTR_91",
      "SECRET_PATH_91",
      "SECRET_QUERY_91",
      "SECRET_HASH_91",
      "SECRET_ACCOUNT_91",
      "SECRET_API_KEY_LABEL_A",
      "SECRET_API_KEY_LABEL_B",
      "SECRET_CLIENT_91",
      "SECRET_DEVICE_CODE_91",
      "SECRET_AFTER_OPTOUT_91",
      "SECRET_PUBLIC_ATTR_91",
      "SECRET_PUBLIC_TEXT_91",
      "SECRET_PUBLIC_INPUT_91",
      "SECRET_IMAGE_91",
      "SECRET_IFRAME_91",
      "private-app-content-marker",
    ])
      assert.equal(
        payload.join("").includes(marker),
        false,
        `leaked ${marker}`,
      );
  }
  assert.ok(decoded > 0, "no actual snapshot decompressed");
  assert.deepEqual(
    failures,
    baselineErrors,
    "App errors differ from the same inert-auth fixture without replay",
  );
  console.log(
    JSON.stringify({
      privateRoutes: routes.length,
      initialBodiesBlocked: true,
      publicToLoginToPublic: true,
      snapshotRequests: snapshots.length,
      decodedSnapshots: decoded,
      pageErrors: failures.length,
      pageErrorMessages: failures,
      baselinePageErrorMessages: baselineErrors,
      authenticatedState: "inert mocked sessions A and B; logout",
    }),
  );
} finally {
  await context.close();
  await browser.close();
}
