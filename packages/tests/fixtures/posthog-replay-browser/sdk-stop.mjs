import { chromium } from "playwright-core";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const executablePath = process.env.REPLAY_CHROMIUM;
if (!executablePath) throw new Error("Set REPLAY_CHROMIUM");
const bundle = await Bun.build({
  entrypoints: [
    resolve("packages/tests/fixtures/posthog-replay-browser/entry.ts"),
  ],
  target: "browser",
  format: "iife",
});
assert.ok(bundle.success);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-background-networking"],
});
const context = await browser.newContext({ serviceWorkers: "block" });
const page = await context.newPage();
const requests = [];
try {
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.host === "fixture.invalid")
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<html><body data-replay-public="true"><button>Go</button></body></html>',
      });
    if (url.host === "posthog.invalid") {
      requests.push({ path: url.pathname, body: req.postData() });
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
    return route.abort();
  });
  await page.goto("https://fixture.invalid/");
  await page.addScriptTag({
    path: resolve("node_modules/posthog-js/dist/array.full.no-external.js"),
  });
  await page.addScriptTag({ content: await bundle.outputs[0].text() });
  await page.evaluate(async () => {
    window.stopSnapshots = 0;
    window.stopping = false;
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
        if (event.event !== "$snapshot") return null;
        if (window.stopping) window.stopSnapshots++;
        return event;
      },
    });
    window.posthog.startSessionRecording();
  });
  await page.waitForFunction(() => window.posthog.sessionRecordingStarted(), {
    timeout: 5000,
  });
  await page.locator("button").click();
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    const node = document.createElement("buffered-structural-marker");
    node.textContent = "SECRET_TEXT_91";
    document.body.append(node);
    console.log("SECRET_CONSOLE_91");
    await fetch("https://network.invalid/SECRET_NETWORK_91").catch(() => {});
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    window.stopping = true;
    window.posthog.stopSessionRecording();
  });
  assert.equal(
    await page.evaluate(() => window.posthog.sessionRecordingStarted()),
    false,
  );
  await page.waitForTimeout(1200);
  assert.ok(
    (await page.evaluate(() => window.stopSnapshots)) > 0,
    "expected a public stop to flush buffered replay",
  );
  assert.ok(
    requests.some((r) => r.path.includes("/config")),
    "recorder config not requested",
  );
  const snapshots = requests
    .filter((r) => r.path.includes("/s/") && r.body)
    .map((r) => JSON.parse(r.body));
  assert.ok(snapshots.length > 0, "no replay payload");
  let markerSeen = false,
    decoded = 0;
  for (const snap of snapshots) {
    assert.equal(JSON.stringify(snap).includes("SECRET_NETWORK_91"), false);
    const data = Array.isArray(snap.batch)
      ? snap.batch.flatMap((x) => x.properties.$snapshot_data)
      : snap.properties.$snapshot_data;
    for (const item of data) {
      const value =
        typeof item.data === "string" && item.data.charCodeAt(0) === 31
          ? gunzipSync(Buffer.from(item.data, "latin1")).toString("utf8")
          : JSON.stringify(item);
      if (typeof item.data === "string" && item.data.charCodeAt(0) === 31)
        decoded++;
      markerSeen ||= value.includes("buffered-structural-marker");
      assert.equal(
        value.includes("SECRET_TEXT_91") ||
          value.includes("SECRET_CONSOLE_91") ||
          value.includes("SECRET_NETWORK_91") ||
          value.includes("rrweb/console@1") ||
          value.includes("rrweb/network@1"),
        false,
        "mask or console control failed",
      );
    }
  }
  console.log(
    JSON.stringify({
      recorderConfigRequests: requests.filter((r) => r.path.includes("/config"))
        .length,
      stopFlushEvents: await page.evaluate(() => window.stopSnapshots),
      snapshotRequests: snapshots.length,
      decodedSnapshots: decoded,
      bufferedMutationSeen: markerSeen,
      hostileConfigReceived: true,
      productionReplayEnabled: false,
    }),
  );
} finally {
  await context.close();
  await browser.close();
}
