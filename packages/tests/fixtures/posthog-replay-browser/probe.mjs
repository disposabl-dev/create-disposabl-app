import { chromium } from "playwright-core";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { resolve } from "node:path";

const executablePath = process.env.REPLAY_CHROMIUM;
if (!executablePath)
  throw new Error("Set REPLAY_CHROMIUM to cached headless Chromium");
const bundle = await Bun.build({
  entrypoints: [
    resolve("packages/tests/fixtures/posthog-replay-browser/entry.ts"),
  ],
  target: "browser",
  format: "iife",
});
assert.equal(bundle.success, true);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--disable-background-networking"],
});
const page = await browser.newPage();
const requests = [];
const markers = [
  "SECRET_TEXT_91",
  "SECRET_INPUT_91",
  "SECRET_ATTR_91",
  "SECRET_IMAGE_91",
  "SECRET_PRIVATE_91",
  "SECRET_PATH_91",
  "SECRET_QUERY_91",
  "SECRET_HASH_91",
  "SECRET_LATE_91",
  "SECRET_CONSOLE_91",
  "SECRET_NETWORK_91",
  "private-content-marker",
];
try {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.url().startsWith("https://fixture.invalid/"))
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: request.url().includes("/initial-private")
          ? '<html><head><title>SECRET_PRIVATE_91</title></head><body><private-content-marker>SECRET_PRIVATE_91<input value="SECRET_INPUT_91"></private-content-marker><button>Go</button></body></html>'
          : '<html><head><title>SECRET_PRIVATE_91</title></head><body data-replay-public="true"><main>SECRET_TEXT_91<input value="SECRET_INPUT_91"><img src="https://image.invalid/SECRET_IMAGE_91"><canvas></canvas><iframe src="https://image.invalid/SECRET_IMAGE_91"></iframe><div data-test="SECRET_ATTR_91">Visible</div><div data-sensitive>SECRET_PRIVATE_91</div><button>Go</button></main></body></html>',
      });
    if (request.url().startsWith("https://posthog.invalid/")) {
      requests.push({ url: request.url(), body: request.postData() });
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
  await page.goto("https://fixture.invalid/?x=SECRET_QUERY_91#SECRET_HASH_91");
  await page.addScriptTag({
    path: resolve("node_modules/posthog-js/dist/array.full.no-external.js"),
  });
  await page.addScriptTag({ content: await bundle.outputs[0].text() });
  await page.evaluate(() => {
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
  });
  await page.locator("button").click();
  await page.evaluate(async () => {
    console.log("SECRET_CONSOLE_91");
    await fetch("https://image.invalid/SECRET_NETWORK_91").catch(() => {});
  });
  await page.waitForTimeout(2500);
  for (const pathname of [
    "/signup",
    "/login",
    "/consent",
    "/apps/SECRET_PATH_91",
    "/account",
  ]) {
    await page.evaluate((path) => {
      history.pushState({}, "", path + "?v=SECRET_QUERY_91#SECRET_HASH_91");
      document.body.removeAttribute("data-replay-public");
      document.body.innerHTML =
        '<main><private-content-marker>SECRET_PRIVATE_91<input value="SECRET_INPUT_91"><img src="https://image.invalid/SECRET_IMAGE_91"></private-content-marker><button>Next</button></main>';
    }, pathname);
    await page.locator("button").click();
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    history.pushState({}, "", "/");
    document.body.setAttribute("data-replay-public", "true");
    document.body.innerHTML = "<main><button>Public</button></main>";
  });
  await page.locator("button").click();
  await page.waitForTimeout(2500);
  const countBeforeOptOut = requests.filter(
    ({ url, body }) => url.includes("/s/") && body,
  ).length;
  await page.evaluate(() => {
    window.posthog.stopSessionRecording();
    window.posthog.opt_out_capturing();
    window.posthog.reset(true);
  });
  assert.equal(
    await page.evaluate(() => window.posthog.sessionRecordingStarted()),
    false,
  );
  await page.evaluate(() => {
    document.body.innerHTML = "<div>SECRET_LATE_91</div>";
  });
  await page.waitForTimeout(2500);
  const firstCount = requests.filter(
    ({ url, body }) => url.includes("/s/") && body,
  ).length;
  assert.equal(
    firstCount,
    countBeforeOptOut,
    "New replay was sent after opt-out",
  );
  await page.goto(
    "https://fixture.invalid/initial-private?x=SECRET_QUERY_91#SECRET_HASH_91",
  );
  await page.addScriptTag({
    path: resolve("node_modules/posthog-js/dist/array.full.no-external.js"),
  });
  await page.addScriptTag({ content: await bundle.outputs[0].text() });
  await page.evaluate(() => {
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
  });
  await page.locator("button").click();
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.posthog.stopSessionRecording());
  await page.waitForTimeout(500);
  assert.equal(
    requests.filter(({ url, body }) => url.includes("/s/") && body).length,
    firstCount,
    "Initial private page sent replay",
  );
  await page.evaluate(() => {
    history.replaceState({}, "", "/");
    document.body.setAttribute("data-replay-public", "true");
    document.body.innerHTML = "<main><button>Go</button></main>";
  });
  for (const identity of [
    "fixture-account-a",
    "fixture-account-b",
    "fixture-anonymous",
  ]) {
    await page.evaluate((id) => {
      const sdk = new window.TestPostHog();
      window.fixtureSDK = sdk;
      sdk.init("phc_switchfixture", {
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
        bootstrap: {
          distinctID: id,
          isIdentifiedID: id !== "fixture-anonymous",
        },
        session_recording: window.replayOptions(),
        before_send(event) {
          if (
            event.event !== "$snapshot" ||
            !window.publicReplayPath(location.pathname)
          )
            return null;
          const properties = window.replayProperties(
            event.properties,
            "phc_switchfixture",
            id,
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
      sdk.startSessionRecording();
    }, identity);
    await page.locator("button").click();
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      window.fixtureSDK.stopSessionRecording();
      window.fixtureSDK.opt_out_capturing();
      window.fixtureSDK.reset(true);
    });
  }
  const snapshots = requests
    .filter(({ url, body }) => url.includes("/s/") && body)
    .map(({ body }) => JSON.parse(body));
  assert.ok(snapshots.length > 0, "No real replay payload was intercepted");
  assert.ok(
    snapshots.length > firstCount,
    "Public account transitions produced no replay payload",
  );
  for (const id of [
    "fixture-account-a",
    "fixture-account-b",
    "fixture-anonymous",
  ])
    assert.ok(
      snapshots.some((snapshot) => snapshot.properties.distinct_id === id),
      `No replay for ${id}`,
    );
  let decodedSnapshots = 0;
  for (const snapshot of snapshots) {
    assert.equal(snapshot.event, "$snapshot");
    const data = snapshot.properties.$snapshot_data;
    assert.ok(Array.isArray(data));
    const decoded = [];
    for (const item of data) {
      if (typeof item.data === "string" && item.data.charCodeAt(0) === 31) {
        decoded.push(
          gunzipSync(Buffer.from(item.data, "latin1")).toString("utf8"),
        );
        decodedSnapshots++;
      } else decoded.push(JSON.stringify(item));
    }
    const all = JSON.stringify(snapshot) + decoded.join("\n");
    for (const marker of markers)
      assert.equal(all.includes(marker), false, `${marker} leaked`);
  }
  assert.ok(decodedSnapshots > 0, "No compressed snapshot was decoded");
  const consent = await page.evaluate(() => {
    const config = {
      api_host: "https://posthog.invalid",
      persistence: "memory",
      autocapture: false,
      opt_out_useragent_filter: true,
      capture_pageview: false,
      capture_pageleave: false,
      disable_compression: true,
      request_batching: false,
      advanced_disable_decide: true,
      disable_session_recording: true,
      disable_external_dependency_loading: true,
      disable_surveys: true,
      bootstrap: { distinctID: "consent-fixture", isIdentifiedID: false },
      before_send(event) {
        if (event.event === "$pageview") {
          const properties = window.safeTelemetryEvent(event.event, {
            active: true,
            deadline: Date.now() + 10000,
            now: Date.now(),
            page: "/dashboard/connections/SECRET_PATH_91?SECRET_QUERY_91",
            source: "web",
            projectToken: "phc_consentfixture",
            distinctId: "consent-fixture",
            sessionId: event.properties.$session_id,
            windowId: event.properties.$window_id,
          });
          return properties
            ? { uuid: event.uuid, event: event.event, properties }
            : null;
        }
        return {
          uuid: event.uuid,
          event: event.event,
          properties: {
            token: "phc_consentfixture",
            distinct_id: "consent-fixture",
          },
        };
      },
    };
    const first = new window.TestPostHog();
    first.init("phc_consentfixture", config);
    first.capture("consent_before");
    first.opt_out_capturing();
    const stopped = first.has_opted_out_capturing();
    first.reset(true);
    const second = new window.TestPostHog();
    second.init("phc_consentfixture", config);
    const optedOut = second.has_opted_out_capturing();
    second.capture("consent_after");
    second.capture("$pageview");
    return { stopped, optedOut };
  });
  await page.waitForTimeout(1000);
  const consentPayloads = requests
    .filter(({ url, body }) => url.includes("/e/") && body)
    .flatMap(({ body }) => {
      const payload = JSON.parse(body);
      return payload.batch ?? [payload];
    });
  const consentEvents = consentPayloads.map((item) => item.event);
  const pageview = consentPayloads.find((item) => item.event === "$pageview");
  assert.equal(
    pageview?.properties.$current_url,
    "https://www.disposabl.dev/dashboard/connections",
  );
  assert.match(pageview?.properties.$session_id ?? "", /^[0-9a-f-]{36}$/i);
  assert.match(pageview?.properties.$window_id ?? "", /^[0-9a-f-]{36}$/i);
  assert.equal(JSON.stringify(pageview).includes("SECRET_"), false);
  assert.equal(consent.stopped, true);
  assert.equal(consent.optedOut, false);
  assert.ok(
    consentEvents.includes("consent_before") &&
      consentEvents.includes("consent_after"),
    "Reinitialized SDK did not send both captures",
  );
  console.log(
    JSON.stringify({
      snapshotRequests: snapshots.length,
      decodedSnapshots,
      guardedPaths: 5,
      initialPrivate: true,
      identityTransitions: 3,
      markers: markers.length,
      stoppedAfterOptOut: true,
      consentReinitialization: consentEvents.filter((name) =>
        name.startsWith("consent_"),
      ),
    }),
  );
} finally {
  await browser.close();
}
