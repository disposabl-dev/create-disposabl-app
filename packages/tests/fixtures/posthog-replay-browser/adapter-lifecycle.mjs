import { chromium } from "playwright-core";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";

const executablePath = process.env.REPLAY_CHROMIUM;
if (!executablePath) throw new Error("Set REPLAY_CHROMIUM");
const mode = process.argv[2] ?? "web";
assert.ok(mode === "web" || mode === "desktop", "invalid fixture mode");
const bundle = await Bun.build({
  entrypoints: [
    resolve("packages/tests/fixtures/posthog-replay-browser/adapter-entry.ts"),
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
const context = await browser.newContext({
  serviceWorkers: "block",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
});
const page = await context.newPage();
// The production SDK suppresses webdriver traffic; model a regular browser here.
await page.addInitScript(() => {
  Object.defineProperty(navigator, "webdriver", { get: () => false });
  Object.defineProperty(navigator, "userAgentData", {
    get: () => ({ brands: [{ brand: "Chromium", version: "130" }] }),
  });
});
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning")
    console.log("browser", message.text());
});
page.on("pageerror", (error) => console.log("pageerror", error.message));
const requests = [];
const bootstrapBodies = [];
let holdRefresh = false;
let releaseRefresh;
let bootstrapCount = 0;
try {
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (
      url.host === "fixture.invalid" &&
      url.pathname === "/telemetry/bootstrap"
    ) {
      bootstrapCount++;
      bootstrapBodies.push(req.postData() || "");
      if (holdRefresh)
        await new Promise((resolve) => {
          releaseRefresh = resolve;
        });
      const auth = req.headers().authorization;
      const id = auth
        ? auth.includes("tokenA")
          ? "account-a"
          : "account-b"
        : "anonymous";
      return route
        .fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            enabled: true,
            projectToken: "phc_fixture",
            host: "https://us.i.posthog.com",
            anonymousId: "00000000-0000-4000-8000-000000000001",
            distinctId: id,
            identified: !!auth,
            expiresAt: Date.now() + 6500,
          }),
        })
        .catch(() => {});
    }
    if (url.host === "us.i.posthog.com") {
      requests.push({
        path: url.pathname,
        body: req.postDataBuffer(),
        when: Date.now(),
      });
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
        }),
      });
    }
    if (url.host === "fixture.invalid")
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body><main>fixture</main></body></html>",
      });
    return route.abort();
  });
  await page.goto("https://fixture.invalid/");
  if (mode === "desktop")
    await page.evaluate(() => {
      window.disposablDesktop = { authentication: true };
    });
  await page.addScriptTag({ content: await bundle.outputs[0].text() });
  await page.evaluate(() => {
    window.fixtureAllowed = true;
    window.adapter = window.createWebTelemetryAdapter({
      origin: "https://fixture.invalid",
      transport: (...args) => {
        window.fixtureAttempts = (window.fixtureAttempts || 0) + 1;
        return fetch(...args)
          .then(async (response) => {
            window.fixtureStatus = response.status;
            window.fixtureReply = await response.clone().json();
            return response;
          })
          .catch((error) => {
            window.fixtureTransportError = error.message;
            throw error;
          });
      },
      page: () => location.pathname,
      allowed: () => window.fixtureAllowed,
      source: window.productTelemetrySource(),
    });
    window.adapter.update({ enabled: true, token: null });
  });
  await page.waitForTimeout(500);
  const firstView = requests.length;
  assert.equal(firstView, 1, "initial view must capture once");
  await page.evaluate(() => {
    window.adapter.page();
    window.adapter.page();
  });
  await page.waitForTimeout(200);
  assert.equal(requests.length, firstView, "duplicate view captured");
  for (const route of ["pricing", "build", "stack", "why-disposabl"]) {
    const before = requests.length;
    await page.evaluate((route) => {
      history.pushState({}, "", `/${route}?SECRET_QUERY_91#SECRET_HASH_91`);
      window.adapter.page();
      window.adapter.page();
    }, route);
    await page.waitForTimeout(200);
    assert.equal(
      requests.length,
      before + 1,
      `${route} view must capture once`,
    );
  }
  await page.evaluate(() => {
    history.pushState({}, "", "/pricing-secret/SECRET_PATH_91?SECRET_QUERY_91");
    window.adapter.page();
    history.pushState({}, "", "/dashboard/SECRET_PATH_91");
    window.adapter.page();
  });
  await page.waitForTimeout(200);
  const beforeConnections = requests.length;
  await page.evaluate(() => {
    history.pushState({}, "", "/dashboard/connections?SECRET_QUERY_91");
    window.adapter.page();
    window.adapter.page();
  });
  await page.waitForTimeout(200);
  assert.equal(
    requests.length,
    beforeConnections + 1,
    "navigation must capture once",
  );
  async function state(id) {
    await page.evaluate((id) => {
      const token = id
        ? `x.${btoa(JSON.stringify({ sub: id }))}.token${id}`
        : null;
      window.adapter.update({ enabled: true, token });
    }, id);
    await page.waitForTimeout(400);
  }
  await state("A");
  await state("B");
  await state(null);
  await page.evaluate(() => {
    window.adapter.action("copy_setup");
    window.adapter.action("open_setup");
    window.adapter.action("SECRET_PROMPT_91");
    window.adapter.action(null);
  });
  await page.waitForTimeout(250);
  // Rapid route changes while the actual adapter remains recording-disabled.
  await page.evaluate(() => {
    history.pushState({}, "", "/login?SECRET_QUERY_91#SECRET_HASH_91");
    document.body.innerHTML =
      "<private-structure-marker>SECRET_PRIVATE_91</private-structure-marker>";
    window.adapter.page();
    history.pushState({}, "", "/");
    document.body.innerHTML = "<p>SECRET_PUBLIC_91</p>";
    window.adapter.page();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.fixtureAllowed = false;
    window.adapter.update({ enabled: false, token: null });
    window.adapter.action("open_connections");
    history.pushState({}, "", "/pricing");
    window.adapter.page();
    history.pushState({}, "", "/");
  });
  const countAtOptOut = requests.length;
  await page.waitForTimeout(400);
  assert.equal(requests.length, countAtOptOut, "new capture after opt-out");
  const beforeReenable = requests.length;
  await page.evaluate(() => {
    window.fixtureAllowed = true;
    window.adapter.update({ enabled: true, token: null });
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.adapter.action("open_connections"));
  await page.waitForTimeout(400);
  assert.ok(
    requests.length > beforeReenable,
    "capture did not resume after opt-in",
  );
  const beforeExpiry = requests.length;
  holdRefresh = true;
  await page.waitForTimeout(7000);
  assert.equal(typeof releaseRefresh, "function", "refresh was not held");
  await page.evaluate(() => {
    window.adapter.action("open_connections");
    history.pushState({}, "", "/build");
    window.adapter.page();
  });
  await page.waitForTimeout(400);
  assert.equal(requests.length, beforeExpiry, "new capture after lease expiry");
  await page.evaluate(() => window.adapter.stop());
  releaseRefresh?.();
  await page.waitForTimeout(250);
  assert.equal(requests.length, beforeExpiry, "late refresh restarted capture");
  const payload = requests
    .filter((x) => x.body)
    .map((x) =>
      JSON.parse(
        x.body[0] === 31 && x.body[1] === 139
          ? gunzipSync(x.body).toString("utf8")
          : x.body.toString("utf8"),
      ),
    )
    .flatMap((x) => x.batch ?? [x]);
  assert.ok(
    payload.length >= 4,
    `insufficient actual SDK events; bootstrap=${bootstrapCount} requests=${requests.map((r) => r.path).join(",")} diagnostic=${JSON.stringify(await page.evaluate(() => ({ attempts: window.fixtureAttempts, error: window.fixtureTransportError, status: window.fixtureStatus, reply: window.fixtureReply })))}`,
  );
  assert.ok(payload.some((x) => x.properties?.distinct_id === "account-a"));
  assert.ok(payload.some((x) => x.properties?.distinct_id === "account-b"));
  assert.ok(payload.some((x) => x.properties?.distinct_id === "anonymous"));
  assert.ok(payload.some((x) => x.properties?.action === "copy_setup"));
  assert.ok(payload.some((x) => x.properties?.action === "open_setup"));
  assert.ok(payload.every((x) => x.properties?.platform === mode));
  for (const route of ["pricing", "build", "stack", "why-disposabl"])
    assert.equal(
      payload.filter(
        (x) =>
          x.event === "$pageview" &&
          x.properties?.page === route &&
          x.properties?.$current_url === `https://www.disposabl.dev/${route}`,
      ).length,
      1,
      `${route} canonical event`,
    );
  assert.ok(
    payload.some(
      (x) =>
        x.event === "$pageview" &&
        x.properties?.page === "other" &&
        !x.properties?.$current_url,
    ),
  );
  assert.ok(
    payload.every((x) => x.properties?.$geoip_disable === true),
    "SDK event missing GeoIP opt-out",
  );
  assert.ok(
    payload.some(
      (x) =>
        x.event === "$pageview" &&
        x.properties?.$current_url ===
          "https://www.disposabl.dev/dashboard/connections",
    ),
  );
  assert.ok(
    requests.every(
      (x) => !x.path.includes("/s/") && !x.path.includes("/config"),
    ),
    "recorder or remote config request",
  );
  assert.ok(payload.every((x) => x.event !== "$snapshot"));
  for (const marker of [
    "SECRET_QUERY_91",
    "SECRET_HASH_91",
    "SECRET_PRIVATE_91",
    "SECRET_PUBLIC_91",
    "SECRET_PROMPT_91",
    "SECRET_PATH_91",
    "private-structure-marker",
  ])
    assert.equal(
      JSON.stringify([payload, bootstrapBodies]).includes(marker),
      false,
      `leaked ${marker}`,
    );
  console.log(
    JSON.stringify({
      bootstrapCount,
      platform: mode,
      capturedEvents: payload.length,
      accounts: ["anonymous", "account-a", "account-b"],
      recordingRequests: 0,
      remoteConfigRequests: 0,
      optOut: true,
      reenabled: true,
      expired: true,
      rapidRoutes: true,
    }),
  );
} finally {
  releaseRefresh?.();
  await context.close();
  await browser.close();
}
