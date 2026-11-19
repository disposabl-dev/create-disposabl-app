import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { httpRouter } from "convex/server";
import { registerPageRoutes } from "../disposabl-kit/server/lib/static";

const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
const requests: (string | null)[] = [];
const storage = createServer((request, response) => {
  const range = request.headers.range ?? null;
  requests.push(range);
  if (range === "bytes=99-") {
    response.writeHead(416, { "Content-Range": "bytes */8" });
    response.end();
  } else if (range === "bytes=10-") {
    response.writeHead(206, {
      "Content-Range": "bytes 10-7/8",
      "Content-Length": "0",
    });
    response.end();
  } else if (range === "bytes=2-4") {
    response.writeHead(206, {
      "Accept-Ranges": "bytes",
      "Content-Range": "bytes 2-4/8",
      "Content-Length": "3",
    });
    response.end(bytes.slice(2, 5));
  } else {
    response.writeHead(200, {
      "Content-Length": "8",
      "Accept-Ranges": "bytes",
    });
    response.end(bytes);
  }
});
storage.listen(0, "127.0.0.1");
await once(storage, "listening");
const address = storage.address();
assert.ok(address && typeof address === "object");
const storageUrl = `http://127.0.0.1:${address.port}`;
after(() => new Promise<void>((resolve) => storage.close(() => resolve())));

async function get(contentType: string, range?: string, extension = "mp4") {
  const router = httpRouter();
  registerPageRoutes(router);
  const path = `/media/example.${extension}`;
  const action = router.lookup(path, "GET")![0];
  const handler = action as unknown as {
    _handler: (ctx: unknown, request: Request) => Promise<Response>;
  };
  return handler._handler(
    {
      runQuery: async () => ({ contentType, storageUrl: storageUrl }),
    },
    new Request(`http://example.test${path}`, {
      headers: range ? { Range: range } : {},
    }),
  );
}

test("video byte requests preserve partial content and exact bytes", async () => {
  const response = await get("video/mp4", "bytes=2-4");
  assert.equal(requests.at(-1), "bytes=2-4");
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Type"), "video/mp4");
  assert.equal(response.headers.get("Content-Range"), "bytes 2-4/8");
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
  assert.equal(response.headers.get("Content-Length"), "3");
  assert.deepEqual(
    [...new Uint8Array(await response.arrayBuffer())],
    [2, 3, 4],
  );
});

test("uploader fallback types still serve playable MP4 and optional captions", async () => {
  const video = await get("application/octet-stream", "bytes=2-4");
  assert.equal(video.status, 206);
  assert.equal(video.headers.get("Content-Type"), "video/mp4");
  const captions = await get("application/octet-stream", undefined, "vtt");
  assert.equal(captions.status, 200);
  assert.equal(captions.headers.get("Content-Type"), "text/vtt; charset=utf-8");
});

test("unsatisfiable video ranges retain the storage response", async () => {
  const response = await get("video/mp4", "bytes=99-");
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("Content-Range"), "bytes */8");
});

test("an impossible storage byte range becomes an empty 416 response", async () => {
  const response = await get("application/octet-stream", "bytes=10-");
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("Content-Range"), "bytes */8");
  assert.equal(response.headers.get("Content-Length"), "0");
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test("ordinary assets keep full-file responses", async () => {
  const response = await get("text/html", "bytes=2-4");
  assert.equal(requests.at(-1), null);
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});
