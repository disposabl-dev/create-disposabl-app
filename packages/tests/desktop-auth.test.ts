import { test } from "node:test";
import assert from "node:assert/strict";
import {
  desktopAuthCallback,
  desktopAuthRedirect,
  desktopAuthScheme,
} from "../disposabl-kit/lib/desktop-auth";
import { externalUrl } from "../../apps/desktop/src/navigation";

const id = "a".repeat(32);
const scheme = desktopAuthScheme(id)!;
test("desktop OAuth returns a ticket only to the app identity", () => {
  const response = desktopAuthRedirect(
    new Request(
      "https://app.test/oauth/desktop?convexAuthCode=ticket&redirectTo=https://evil.test",
    ),
    id,
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    response.headers.get("location"),
    `${scheme}://login?convexAuthCode=ticket`,
  );
  assert.equal(
    desktopAuthCallback(
      response.headers.get("location")!,
      id,
      "https://app.test/login?returnTo=%2Fdashboard",
    ),
    "https://app.test/login?returnTo=%2Fdashboard&convexAuthCode=ticket",
  );
  for (const query of [
    "",
    "convexAuthCode=",
    "convexAuthCode=a&convexAuthCode=b",
    "convexAuthCode=a&convexAuthError=x",
    `convexAuthCode=${"x".repeat(4097)}`,
  ]) {
    assert.equal(
      desktopAuthRedirect(
        new Request(`https://app.test/oauth/desktop?${query}`),
        id,
      ).status,
      400,
    );
    assert.equal(
      desktopAuthCallback(`${scheme}://login?${query}`, id, "https://app.test"),
      null,
    );
  }
  for (const input of [
    "https://evil.test/?convexAuthCode=t",
    `${scheme}://other?convexAuthCode=t`,
    `${scheme}://login/path?convexAuthCode=t`,
    `${scheme}://user@login?convexAuthCode=t`,
    `${scheme}://login?convexAuthCode=t#extra`,
    `${desktopAuthScheme("b".repeat(32))}://login?convexAuthCode=t`,
  ])
    assert.equal(desktopAuthCallback(input, id, "https://app.test"), null);
  assert.equal(desktopAuthScheme("../other"), null);
  assert.equal(
    desktopAuthCallback(
      `${scheme}://login?convexAuthError=unknown`,
      id,
      "https://app.test",
    ),
    "https://app.test/?convexAuthError=oauth_error",
  );
});

test("desktop external links allow HTTPS but never credentials or native protocols", () => {
  assert.equal(
    externalUrl("https://example.test/a?q=b#c"),
    "https://example.test/a?q=b#c",
  );
  for (const url of [
    "file:///tmp/example",
    "javascript:alert(1)",
    "data:text/html,test",
    "http://example.test",
    "https://user:secret@example.test",
    "ms-settings:privacy",
    "not a URL",
  ])
    assert.equal(externalUrl(url), null);
});
