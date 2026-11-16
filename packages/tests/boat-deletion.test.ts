import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteSandbox } from "../backend/convex/users/actions/fulfillment";

test("known Boat ID uses idempotent DELETE and treats only success or 404 as gone", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const transport = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return new Response(null, { status: 404 });
  };
  await deleteSandbox("sandbox/id", "test-key", transport as typeof fetch);
  assert.match(calls[0]!.url, /sandbox%2Fid$/);
  assert.equal(calls[0]!.init.method, "DELETE");
  assert.equal(
    (calls[0]!.init.headers as Record<string, string>)[
      "X-Ascii-Confirm-Delete"
    ],
    "sandbox/id",
  );
  await assert.rejects(
    deleteSandbox(
      "sandbox/id",
      "test-key",
      (async () => new Response("{}", { status: 503 })) as typeof fetch,
    ),
  );
  await assert.rejects(
    deleteSandbox(
      "sandbox/id",
      "test-key",
      (async () =>
        new Response('{"ok":false}', { status: 200 })) as typeof fetch,
    ),
  );
});
