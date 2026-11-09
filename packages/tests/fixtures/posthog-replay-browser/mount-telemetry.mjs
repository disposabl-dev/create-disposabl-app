import { chromium, _electron as electron } from "playwright-core";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { accessSync, constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { exerciseBilling } from "./billing-mount.mjs";

const dist = resolve(process.env.REPLAY_APP_DIST || "");
const mode = process.argv[2];
assert.ok(["web", "desktop", "electron"].includes(mode), "invalid mount mode");
assert.ok(process.env.REPLAY_APP_DIST && process.env.REPLAY_CHROMIUM);
if (mode === "electron") {
  assert.equal(process.env.REPLAY_ELECTRON_NO_SANDBOX, "1");
  assert.ok(
    process.env.REPLAY_ELECTRON_BINARY && process.env.REPLAY_ELECTRON_ENTRY,
  );
  accessSync(process.env.REPLAY_ELECTRON_BINARY, constants.X_OK);
  accessSync(process.env.REPLAY_ELECTRON_ENTRY, constants.R_OK);
  // Require an actual outbound permission denial, including for direct invocation.
  // A timeout, offline host, or caller-provided attestation is insufficient.
  execFileSync(
    "/usr/bin/python3",
    [
      "-c",
      `
import errno, socket
for family, address in [(socket.AF_INET, ('1.1.1.1', 443)), (socket.AF_INET6, ('2606:4700:4700::1111', 443))]:
    with socket.socket(family, socket.SOCK_STREAM) as probe:
        probe.settimeout(2)
        try:
            probe.connect(address)
        except OSError as error:
            assert error.errno == errno.EPERM, 'Outbound OS denial is required'
        else:
            raise RuntimeError('Outbound OS denial is required')
`,
    ],
    { stdio: "pipe" },
  );
}
const electronApp =
  mode === "electron"
    ? await electron.launch({
        executablePath: process.env.REPLAY_ELECTRON_BINARY,
        args: [process.env.REPLAY_ELECTRON_ENTRY, "--no-sandbox"],
        timeout: 20000,
      })
    : null;
const browser = electronApp
  ? null
  : await chromium.launch({
      executablePath: process.env.REPLAY_CHROMIUM,
      headless: true,
      args: ["--disable-background-networking"],
    });
const context = electronApp
  ? electronApp.context()
  : await browser.newContext({
      serviceWorkers: "block",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    });
let page;
const paths = [],
  captures = [],
  bootstraps = [],
  generic = [],
  failures = [],
  outbound = [];
try {
  await context.addInitScript((mode) => {
    if (location.origin !== "https://fixture.invalid") return;
    if (
      Object.getOwnPropertyDescriptor(navigator, "webdriver")?.configurable !==
      false
    )
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
        configurable: true,
      });
    if (
      Object.getOwnPropertyDescriptor(navigator, "userAgentData")
        ?.configurable !== false
    )
      Object.defineProperty(navigator, "userAgentData", {
        get: () => ({ brands: [{ brand: "Chromium", version: "130" }] }),
        configurable: true,
      });
    if (mode === "desktop") window.disposablDesktop = { authentication: true };
    localStorage.setItem("fixture-session", "A");
    window.fixtureBillingCalls = [];
    sessionStorage.setItem("disposabl.connectionsSession", "A");
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value) => {
          window.fixtureClipboard = value;
        },
      },
    });
  }, mode);
  await context.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    paths.push(`${req.method()} ${url.host}${url.pathname}`);
    if (url.pathname.includes("telemetry") || url.host !== "fixture.invalid")
      outbound.push({ url: req.url(), body: req.postData() });
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
    if (url.pathname === "/telemetry/bootstrap") {
      bootstraps.push(!!req.headers().authorization);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled: true,
          projectToken: "phc_fixture",
          host: "https://us.i.posthog.com",
          anonymousId: "00000000-0000-4000-8000-000000000001",
          distinctId: !req.headers().authorization
            ? "anonymous-a"
            : req.headers().authorization.includes("eyJzdWIiOiJCIn0")
              ? "account-b"
              : "account-a",
          identified: !!req.headers().authorization,
          expiresAt: Date.now() + 30000,
        }),
      });
    }
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
  if (electronApp) {
    await electronApp.evaluate(() => globalThis.startTestProduct());
    page = await electronApp.firstWindow({ timeout: 20000 });
    await page.waitForURL("https://fixture.invalid/", { timeout: 15000 });
    await page
      .locator("#hero-title")
      .waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(1000);
    assert.deepEqual(
      captures
        .filter((event) => event.event === "$pageview")
        .map((event) => event.properties.page),
      ["home"],
      "product main must load and mount the configured website before test navigation",
    );
    captures.length = 0;
  } else page = await context.newPage();
  page.on("pageerror", (e) => failures.push(e.message));
  const expectedPlatform = mode === "electron" ? "desktop" : mode;
  if (process.env.REPLAY_BILLING_MOUNT === "1") {
    await exerciseBilling({
      page,
      mode,
      captures,
      paths,
      generic,
      failures,
      outbound,
    });
  } else {
    await page.goto("https://fixture.invalid/dashboard", {
      waitUntil: "domcontentloaded",
    });
    if (electronApp) {
      assert.equal(
        await page.evaluate(() => window.disposablDesktop?.authentication),
        true,
      );
      assert.equal(
        await page.evaluate(() => typeof window.require),
        "undefined",
      );
    }
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
            optout: localStorage.getItem(
              "disposabl.product.analytics.optout.v1",
            ),
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
          v.properties.platform === expectedPlatform &&
          v.properties.distinct_id === "account-a",
      ),
    );
    assert.equal(
      views()[1].properties.$current_url,
      "https://www.disposabl.dev/dashboard/connections",
    );
    await page.goBack();
    await page.waitForURL("**/dashboard");
    const keysLink = page.getByRole("link", { name: "API keys" });
    await keysLink.click();
    await page.waitForURL("**/dashboard/api-keys");
    await page.evaluate(() => {
      history.replaceState(
        history.state,
        "",
        "/dashboard/api-keys?token=SECRET_QUERY_91#SECRET_HASH_91",
      );
    });
    const name = page.getByLabel("Key name");
    await name.fill("SECRET_KEY_NAME_91");
    await name.press("Enter");
    await page.getByRole("button", { name: "Copy key" }).click();
    assert.equal(
      await page.evaluate(() => window.fixtureClipboard),
      "SECRET_KEY_MATERIAL_91",
    );
    await page.getByRole("button", { name: "Revoke" }).click();
    await page.waitForTimeout(500);
    const keyActions = () =>
      captures.filter(
        (event) =>
          event.event === "product_action" &&
          event.properties.action.startsWith("api_key_"),
      );
    assert.deepEqual(
      keyActions().map((event) => event.properties.action),
      [
        "api_key_create_attempt",
        "api_key_copy_attempt",
        "api_key_revoke_attempt",
      ],
    );
    if (electronApp) {
      await page.evaluate(() => {
        localStorage.setItem("fixture-session", "B");
        window.dispatchEvent(new Event("fixture-auth-change"));
      });
      await page.waitForTimeout(1000);
      await page.getByRole("button", { name: "Revoke" }).click();
      await page.waitForTimeout(1000);
      assert.equal(keyActions().at(-1)?.properties.distinct_id, "account-b");
    }
    const before = keyActions().length;
    await page.evaluate(() => {
      window.fixtureClock = Date.now;
      Date.now = () => window.fixtureClock() + 60000;
    });
    await page.getByRole("button", { name: "Revoke" }).click();
    await page.waitForTimeout(300);
    assert.equal(
      keyActions().length,
      before,
      "expired lease emitted an action",
    );
    await page.evaluate(() => {
      Date.now = window.fixtureClock;
    });
    await page.getByRole("button", { name: /Allow analytics:/ }).click();
    await page.getByRole("button", { name: "Revoke" }).click();
    await page.waitForTimeout(300);
    assert.equal(keyActions().length, before, "opt-out emitted an action");
    if (electronApp) {
      const prior = bootstraps.length;
      await page.evaluate(() => {
        localStorage.removeItem("fixture-session");
        window.dispatchEvent(new Event("fixture-auth-change"));
      });
      await page.waitForTimeout(500);
      assert.equal(
        bootstraps.length,
        prior,
        "opt-out allowed logout bootstrap",
      );
      await page.getByRole("button", { name: /Allow analytics:/ }).click();
      await page.waitForTimeout(1000);
      assert.ok(
        bootstraps.length > prior && bootstraps.at(-1) === false,
        "re-enabled logout did not use anonymous bootstrap",
      );
    }
    assert.ok(
      captures.every(
        (event) => event.properties?.platform === expectedPlatform,
      ),
    );
    for (const marker of [
      "SECRET_KEY_NAME_91",
      "SECRET_KEY_MATERIAL_91",
      "SECRET_KEY_ID_91",
      "SECRET_API_KEY_LABEL_",
      "SECRET_ACCOUNT_91",
      "SECRET_QUERY_91",
      "SECRET_HASH_91",
    ]) {
      assert.ok(
        !JSON.stringify([captures, outbound]).includes(marker),
        `private marker leaked: ${marker}`,
      );
    }
    for (const event of captures) {
      const url = event.properties?.$current_url;
      assert.ok(
        !url ||
          [
            "https://www.disposabl.dev/dashboard",
            "https://www.disposabl.dev/dashboard/connections",
            ...(electronApp ? ["https://www.disposabl.dev/login"] : []),
          ].includes(url),
        "noncanonical URL captured",
      );
    }
    assert.ok(
      !paths.some((path) => path.includes("/s/") || path.includes("/config")),
      "recording or remote configuration request",
    );
    assert.equal(
      generic.length,
      0,
      "generic starter transport must not capture",
    );
    console.log(
      JSON.stringify({
        views: views().map((v) => v.properties.page),
        platform: expectedPlatform,
        genericRequests: generic.length,
        keyActions: keyActions().map((event) => event.properties.action),
        expiredSuppressed: true,
        optOutSuppressed: true,
        ...(electronApp ? { productMainLoadedHome: true } : {}),
        pageErrors: failures,
      }),
    );
  }
} finally {
  if (electronApp) await electronApp.close();
  else {
    await context.close();
    await browser.close();
  }
}
