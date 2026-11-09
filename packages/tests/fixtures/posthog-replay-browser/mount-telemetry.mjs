import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";

const dist = resolve(process.env.REPLAY_APP_DIST || "");
const mode = process.argv[2];
assert.ok(mode === "web" || mode === "desktop", "invalid mount mode");
assert.ok(process.env.REPLAY_APP_DIST && process.env.REPLAY_CHROMIUM);
const browser = await chromium.launch({
  executablePath: process.env.REPLAY_CHROMIUM,
  headless: true,
  args: ["--disable-background-networking"],
});
const context = await browser.newContext({
  serviceWorkers: "block",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
});
const page = await context.newPage();
const paths = [],
  captures = [],
  generic = [],
  failures = [];
page.on("pageerror", (e) => failures.push(e.message));
try {
  await page.addInitScript((mode) => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "userAgentData", {
      get: () => ({ brands: [{ brand: "Chromium", version: "130" }] }),
    });
    if (mode === "desktop") window.disposablDesktop = { authentication: true };
    localStorage.setItem("fixture-session", "A");
    sessionStorage.setItem("disposabl.connectionsSession", "A");
  }, mode);
  await context.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.pathname.includes("telemetry") || url.host === "us.i.posthog.com")
      paths.push(`${req.method()} ${url.host}${url.pathname}`);
    if (url.host === "us.i.posthog.com") {
      const body = req.postDataBuffer();
      if (body) {
        const parsed = JSON.parse(
          body[0] === 31 && body[1] === 139
            ? gunzipSync(body).toString()
            : body.toString(),
        );
        captures.push(...(parsed.batch ?? [parsed]));
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    }
    if (url.host !== "fixture.invalid") return route.abort();
    if (url.pathname === "/telemetry/bootstrap")
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled: true,
          projectToken: "phc_fixture",
          host: "https://us.i.posthog.com",
          anonymousId: "00000000-0000-4000-8000-000000000001",
          distinctId: "account-a",
          identified: !!req.headers().authorization,
          expiresAt: Date.now() + 30000,
        }),
      });
    if (url.pathname === "/telemetry/page") {
      generic.push(url.pathname);
      return route.fulfill({ status: 200, body: "{}" });
    }
    let name = decodeURIComponent(url.pathname);
    if (name === "/") name = "/index.html";
    else if (!name.includes(".")) name += "/index.html";
    let file = resolve(dist, "." + name);
    if (!file.startsWith(dist + sep)) return route.abort();
    let body;
    try {
      body = await readFile(file);
    } catch {
      file = resolve(dist, "_shell.html");
      body = await readFile(file);
    }
    return route.fulfill({ status: 200, path: file, body });
  });
  await page.goto("https://fixture.invalid/dashboard", {
    waitUntil: "domcontentloaded",
  });
  const link = page.locator('a[href="/dashboard/connections"]').first();
  try {
    await link.waitFor({ state: "visible", timeout: 15000 });
  } catch (error) {
    console.log(
      JSON.stringify({
        url: page.url(),
        body: (await page.locator("body").innerText()).slice(0, 2000),
        captures,
        failures,
      }),
    );
    throw error;
  }
  await page.waitForTimeout(1000);
  const views = () => captures.filter((event) => event.event === "$pageview");
  if (!views().length)
    console.log(
      JSON.stringify({
        paths,
        failures,
        captures,
        browser: await page.evaluate(() => ({
          dnt: navigator.doNotTrack,
          optout: localStorage.getItem("disposabl.product.analytics.optout.v1"),
          session: localStorage.getItem("fixture-session"),
        })),
      }),
    );
  assert.deepEqual(
    views().map((v) => v.properties.page),
    ["dashboard"],
  );
  await link.click();
  await page.waitForURL("**/dashboard/connections");
  await page.waitForTimeout(1000);
  assert.deepEqual(
    views().map((v) => v.properties.page),
    ["dashboard", "connections"],
  );
  assert.ok(
    views().every(
      (v) =>
        v.properties.platform === mode &&
        v.properties.distinct_id === "account-a",
    ),
  );
  assert.equal(
    views()[1].properties.$current_url,
    "https://www.disposabl.dev/dashboard/connections",
  );
  assert.equal(generic.length, 0, "generic starter transport must not capture");
  console.log(
    JSON.stringify({
      views: views().map((v) => v.properties.page),
      platform: mode,
      genericRequests: generic.length,
      pageErrors: failures,
    }),
  );
} finally {
  await context.close();
  await browser.close();
}
