import { test } from "node:test";
import assert from "node:assert/strict";
import { apiError } from "./errors";

test("credit errors present only the trusted payment page and never a redirect", () => {
  const response = (paymentUrl: string) =>
    JSON.stringify({ error: { code: "credits_required", paymentUrl } });
  const message = apiError(400, response("https://www.disposabl.dev/pricing"));
  assert.match(message, /10 credits per 10-minute window/);
  assert.match(message, /https:\/\/www\.disposabl\.dev\/pricing/);
  for (const url of [
    "https://evil.example/pricing",
    "https://www.disposabl.dev/pricing?token=secret",
    "https://user:secret@www.disposabl.dev/pricing",
    "javascript:alert(1)",
  ]) {
    assert.ok(!apiError(400, response(url)).includes(url));
  }
  assert.match(
    apiError(400, '{"error":{"code":"credits_unavailable"}}'),
    /temporarily unavailable/,
  );
  assert.equal(apiError(500, "failure"), "API request failed (500): failure");
});
