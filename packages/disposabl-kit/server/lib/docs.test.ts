import assert from "node:assert/strict";
import { test } from "node:test";
import {
  httpRouter,
  type GenericActionCtx,
  type GenericDataModel,
} from "convex/server";
import { registerDocsRoutes } from "./docs";

function setup() {
  const router = httpRouter();
  registerDocsRoutes(router);
  const paths: string[] = [];
  const assets = new Map([
    [
      "/docs/index.html",
      { contentType: "text/html", storageUrl: "data:text/html,Docs" },
    ],
    [
      "/docs/guides/writing/index.html",
      { contentType: "text/html", storageUrl: "data:text/html,Writing" },
    ],
    [
      "/docs/404.html",
      { contentType: "text/html", storageUrl: "data:text/html,Missing" },
    ],
    [
      "/docs/RSC/R/guides/writing.txt",
      { contentType: "text/plain", storageUrl: "data:text/plain,RSC" },
    ],
  ]);
  const ctx = {
    runQuery: (
      _query: unknown,
      args: { path: string; spaFallback: boolean },
    ) => {
      assert.equal(args.spaFallback, false);
      paths.push(args.path);
      return Promise.resolve(assets.get(args.path) ?? null);
    },
  } as unknown as GenericActionCtx<GenericDataModel>;
  async function get(path: string, accept = "text/html") {
    const request = new Request(`https://example.convex.site${path}`, {
      headers: { Accept: accept },
    });
    const match = router.lookup(new URL(request.url).pathname, "GET");
    assert.ok(match);
    const action = match[0] as unknown as {
      _handler: (context: typeof ctx, request: Request) => Promise<Response>;
    };
    return action._handler(ctx, request);
  }
  return { router, paths, get };
}

test("docs root redirects to the Waku base path and preserves query parameters", async () => {
  const { get, paths } = setup();
  const response = await get("/docs?q=writing");
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("Location"),
    "https://example.convex.site/docs/?q=writing",
  );
  assert.deepEqual(paths, []);
});

test("root and nested clean URLs resolve their directory indexes", async () => {
  const { get } = setup();
  assert.equal(await (await get("/docs/")).text(), "Docs");
  for (const path of ["/docs/guides/writing", "/docs/guides/writing/"]) {
    const response = await get(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "text/html");
    assert.equal(await response.text(), "Writing");
  }
});

test("RSC files are served at their exact path with their content type", async () => {
  const { get, paths } = setup();
  const response = await get("/docs/RSC/R/guides/writing.txt", "*/*");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/plain");
  assert.equal(await response.text(), "RSC");
  assert.deepEqual(paths, ["/docs/RSC/R/guides/writing.txt"]);
});

test("missing pages retain HTTP 404 and never use the app homepage", async () => {
  const { get, paths } = setup();
  const response = await get("/docs/missing");
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Missing");
  assert.ok(!paths.includes("/index.html"));
  const asset = await get("/docs/assets/missing.js", "*/*");
  assert.equal(asset.status, 404);
  assert.equal(await asset.text(), "Not Found");
});

test("malformed paths are rejected and other routes remain outside the docs handler", async () => {
  const { get, paths, router } = setup();
  for (const path of [
    "/docs/%",
    "/docs/%2e%2e%2fprivate",
    "/docs/%5cprivate",
    "/docs/%00",
  ]) {
    assert.equal((await get(path)).status, 400);
  }
  assert.deepEqual(paths, []);
  assert.equal(router.lookup("/dashboard", "GET"), null);
  assert.equal(router.lookup("/docs-other", "GET"), null);
});
