import assert from "node:assert/strict";

export async function exerciseBilling({
  page,
  mode,
  captures,
  paths,
  generic,
  failures,
  outbound,
}) {
  await page.goto("https://fixture.invalid/pricing", {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => {
    history.replaceState(
      history.state,
      "",
      "/pricing?SECRET_QUERY_91#SECRET_HASH_91",
    );
  });
  const monthly = page.getByRole("button", { name: "Choose monthly" });
  await monthly.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(500);
  assert.equal(
    captures.filter((event) => event.event === "$pageview").length,
    1,
    "pricing mount must capture exactly one pageview",
  );
  for (const name of [
    "Choose monthly",
    "Buy top-up",
    "Manage website billing",
  ]) {
    const control = page.getByRole("button", { name });
    await page.waitForFunction(
      (name) =>
        [...document.querySelectorAll("button")].some(
          (button) => button.textContent?.trim() === name && !button.disabled,
        ),
      name,
    );
    await control.focus();
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(500);
  const billingActions = () =>
    captures.filter(
      (event) =>
        event.event === "product_action" &&
        event.properties.action.startsWith("billing_"),
    );
  assert.deepEqual(
    billingActions().map((event) => event.properties.action),
    [
      "billing_monthly_checkout_attempt",
      "billing_topup_checkout_attempt",
      "billing_portal_attempt",
    ],
  );
  for (const event of billingActions())
    assert.ok(
      Object.keys(event.properties).every((key) =>
        [
          "token",
          "distinct_id",
          "platform",
          "$geoip_disable",
          "$session_id",
          "$window_id",
          "action",
        ].includes(key),
      ),
      "unexpected billing event property",
    );
  assert.deepEqual(await page.evaluate(() => window.fixtureBillingCalls), [
    "monthly",
    "topup",
    "portal",
  ]);
  const before = billingActions().length;
  await page.evaluate(() => {
    window.fixtureClock = Date.now;
    Date.now = () => window.fixtureClock() + 60000;
  });
  await page.getByRole("button", { name: "Buy top-up" }).click();
  await page.waitForTimeout(300);
  assert.equal(
    billingActions().length,
    before,
    "expired lease emitted an action",
  );
  await page.evaluate(() => {
    Date.now = window.fixtureClock;
  });
  await page.getByRole("button", { name: /Allow analytics:/ }).click();
  await page.getByRole("button", { name: "Manage website billing" }).click();
  await page.waitForTimeout(300);
  assert.equal(billingActions().length, before, "opt-out emitted an action");
  assert.ok(captures.every((event) => event.properties?.platform === mode));
  assert.ok(
    captures.every((event) => event.properties?.$geoip_disable === true),
  );
  for (const marker of [
    "SECRET_KEY_NAME_91",
    "SECRET_KEY_MATERIAL_91",
    "SECRET_KEY_ID_91",
    "SECRET_API_KEY_LABEL_",
    "SECRET_ACCOUNT_91",
    "SECRET_CUSTOMER_91",
    "SECRET_PROVIDER_ERROR_91",
    "424242",
    "$5",
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
          "https://www.disposabl.dev/pricing",
          "https://www.disposabl.dev/dashboard",
          "https://www.disposabl.dev/dashboard/connections",
        ].includes(url),
      "noncanonical URL captured",
    );
  }
  assert.ok(
    !paths.some((path) => /\/(?:s|config)(?:[/.]|$)/.test(path)),
    "recording or remote configuration request",
  );
  assert.equal(generic.length, 0, "generic starter transport must not capture");
  console.log(
    JSON.stringify({
      views: captures
        .filter((event) => event.event === "$pageview")
        .map((event) => event.properties.page),
      platform: mode,
      genericRequests: generic.length,
      billingActions: billingActions().map((event) => event.properties.action),
      keyboardActivation: true,
      expiredSuppressed: true,
      optOutSuppressed: true,
      pageErrors: failures,
    }),
  );
}
